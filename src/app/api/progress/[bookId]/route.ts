import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import { PROGRESS_TIME_CAP_SECONDS } from "@/lib/recommendations/constants";
import { scheduleRecommendationsRecompute } from "@/lib/recommendations/trigger";

const ParamsSchema = z.object({
  bookId: z.string().uuid(),
});

const PutBodySchema = z.object({
  progress: z.number().min(0).max(1).optional(),
  currentCfi: z.string().min(1).max(10_000).nullable().optional(),
  currentPage: z.number().int().positive().nullable().optional(),
  status: z.enum(["not_started", "reading", "finished", "abandoned"]).optional(),
  /** Client clock for reading-time delta (ISO-8601). Optional; server time if omitted. */
  clientNow: z.string().min(1).max(40).optional(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  return runApiRoute(req, { auth: requireUser }, async ({ user }) => {
    const userId = z
      .string()
      .uuid()
      .parse((user as { id?: unknown }).id);
    const parsedParams = ParamsSchema.safeParse(await ctx.params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
    }

    const row = await prisma.userBookProgress.findUnique({
      where: {
        userId_bookId: { userId, bookId: parsedParams.data.bookId },
      },
      select: {
        progress: true,
        currentCfi: true,
        currentPage: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        updatedAt: true,
        totalReadingSeconds: true,
        lastProgressClientAt: true,
      },
    });

    return NextResponse.json(
      row ?? {
        progress: 0,
        currentCfi: null,
        currentPage: null,
        status: "not_started",
        startedAt: null,
        finishedAt: null,
        updatedAt: null,
        totalReadingSeconds: 0,
        lastProgressClientAt: null,
      },
      { status: 200 },
    );
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ bookId: string }> }) {
  return runApiRoute(
    req,
    {
      sameOrigin: true,
      auth: requireUser,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const userId = z
          .string()
          .uuid()
          .parse((user as { id?: unknown }).id);
        await rateLimitOrThrow({
          key: `progress:put:${userId}:${ip}`,
          limit: 240,
          windowMs: 60_000,
        });
      },
    },
    async ({ req, user }) => {
      const userId = z
        .string()
        .uuid()
        .parse((user as { id?: unknown }).id);
      const parsedParams = ParamsSchema.safeParse(await ctx.params);
      if (!parsedParams.success) {
        return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
      }

      const body = await parseJsonBody(req);
      const parsedBody = PutBodySchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }

      const book = await prisma.book.findFirst({
        where: { id: parsedParams.data.bookId, deletedAt: null },
        select: { id: true, format: true },
      });
      if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const isEpub = book.format === "epub";
      const rawBody = body as Record<string, unknown>;

      if (!isEpub) {
        if ("currentCfi" in rawBody || "currentPage" in rawBody) {
          return NextResponse.json(
            { error: "Reader position fields are only supported for EPUB" },
            { status: 400 },
          );
        }
        if (parsedBody.data.status === undefined) {
          return NextResponse.json(
            { error: "status is required for non-EPUB books" },
            { status: 400 },
          );
        }
        const p = parsedBody.data.progress;
        if (typeof p === "number" && p !== 0 && p !== 1) {
          return NextResponse.json(
            { error: "progress for non-EPUB books must be 0 or 1" },
            { status: 400 },
          );
        }
      }

      let nextProgress = parsedBody.data.progress;
      const nextStatus: "not_started" | "reading" | "finished" | "abandoned" | undefined = isEpub
        ? (parsedBody.data.status ??
          (typeof nextProgress === "number" && nextProgress > 0 ? "reading" : undefined))
        : parsedBody.data.status;

      if (!isEpub && typeof nextProgress !== "number") {
        nextProgress = nextStatus === "finished" ? 1 : nextStatus === "abandoned" ? 0 : 0;
      }

      let refTime = new Date();
      if (parsedBody.data.clientNow) {
        const parsed = new Date(parsedBody.data.clientNow);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ error: "Invalid clientNow" }, { status: 400 });
        }
        refTime = parsed;
      }
      const now = new Date();

      const existing = await prisma.userBookProgress.findUnique({
        where: { userId_bookId: { userId, bookId: parsedParams.data.bookId } },
        select: {
          status: true,
          progress: true,
          totalReadingSeconds: true,
          lastProgressClientAt: true,
        },
      });

      const effectiveStatus = nextStatus ?? existing?.status ?? "not_started";
      const effectiveProgress =
        typeof nextProgress === "number" ? nextProgress : (existing?.progress ?? 0);
      const isReadingLike =
        effectiveStatus === "reading" ||
        (effectiveStatus !== "finished" &&
          effectiveStatus !== "abandoned" &&
          effectiveProgress > 0);

      let totalReadingSeconds = existing?.totalReadingSeconds ?? 0;
      let lastProgressClientAt = existing?.lastProgressClientAt ?? null;

      const shouldCreditTime =
        isEpub &&
        isReadingLike &&
        (parsedBody.data.progress !== undefined ||
          parsedBody.data.currentCfi !== undefined ||
          parsedBody.data.currentPage !== undefined ||
          nextStatus === "reading");

      if (shouldCreditTime && lastProgressClientAt) {
        const deltaMs = refTime.getTime() - lastProgressClientAt.getTime();
        if (deltaMs > 0) {
          const sec = Math.min(PROGRESS_TIME_CAP_SECONDS, Math.floor(deltaMs / 1000));
          totalReadingSeconds += sec;
        }
      }
      if (shouldCreditTime) {
        lastProgressClientAt = refTime;
      }

      const becameFinished = nextStatus === "finished" && existing?.status !== "finished";

      const updated = await prisma.userBookProgress.upsert({
        where: {
          userId_bookId: { userId, bookId: parsedParams.data.bookId },
        },
        create: {
          userId,
          bookId: parsedParams.data.bookId,
          progress: nextProgress ?? 0,
          currentCfi: isEpub ? (parsedBody.data.currentCfi ?? null) : null,
          currentPage: isEpub ? (parsedBody.data.currentPage ?? null) : null,
          status: (nextStatus ?? "not_started") as never,
          startedAt: nextStatus === "reading" ? now : null,
          finishedAt: nextStatus === "finished" ? now : null,
          totalReadingSeconds,
          lastProgressClientAt,
        },
        update: {
          progress: typeof nextProgress === "number" ? nextProgress : undefined,
          currentCfi: isEpub
            ? parsedBody.data.currentCfi !== undefined
              ? parsedBody.data.currentCfi
              : undefined
            : undefined,
          currentPage: isEpub
            ? parsedBody.data.currentPage !== undefined
              ? parsedBody.data.currentPage
              : undefined
            : undefined,
          status: nextStatus ? (nextStatus as never) : undefined,
          startedAt: nextStatus === "reading" ? now : undefined,
          finishedAt: nextStatus === "finished" ? now : undefined,
          totalReadingSeconds,
          lastProgressClientAt,
        },
        select: {
          progress: true,
          currentCfi: true,
          currentPage: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          updatedAt: true,
          totalReadingSeconds: true,
          lastProgressClientAt: true,
        },
      });

      if (becameFinished) {
        scheduleRecommendationsRecompute(userId);
      }

      return NextResponse.json(updated, { status: 200 });
    },
  );
}
