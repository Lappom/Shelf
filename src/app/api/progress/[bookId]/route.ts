import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({
  bookId: z.string().uuid(),
});

const PutBodySchema = z.object({
  progress: z.number().min(0).max(1).optional(),
  currentCfi: z.string().min(1).max(10_000).nullable().optional(),
  currentPage: z.number().int().positive().nullable().optional(),
  status: z.enum(["not_started", "reading", "finished", "abandoned"]).optional(),
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
      if (book.format !== "epub") {
        return NextResponse.json({ error: "Not an EPUB" }, { status: 400 });
      }

      const nextProgress = parsedBody.data.progress;
      const nextStatus =
        parsedBody.data.status ??
        (typeof nextProgress === "number" && nextProgress > 0 ? "reading" : undefined);

      const now = new Date();
      const updated = await prisma.userBookProgress.upsert({
        where: {
          userId_bookId: { userId, bookId: parsedParams.data.bookId },
        },
        create: {
          userId,
          bookId: parsedParams.data.bookId,
          progress: nextProgress ?? 0,
          currentCfi: parsedBody.data.currentCfi ?? null,
          currentPage: parsedBody.data.currentPage ?? null,
          status: (nextStatus ?? "not_started") as never,
          startedAt: nextStatus === "reading" ? now : null,
          finishedAt: nextStatus === "finished" ? now : null,
        },
        update: {
          progress: typeof nextProgress === "number" ? nextProgress : undefined,
          currentCfi:
            parsedBody.data.currentCfi !== undefined ? parsedBody.data.currentCfi : undefined,
          currentPage:
            parsedBody.data.currentPage !== undefined ? parsedBody.data.currentPage : undefined,
          status: nextStatus ? (nextStatus as never) : undefined,
          startedAt: nextStatus === "reading" ? now : undefined,
          finishedAt: nextStatus === "finished" ? now : undefined,
        },
        select: {
          progress: true,
          currentCfi: true,
          currentPage: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          updatedAt: true,
        },
      });

      return NextResponse.json(updated, { status: 200 });
    },
  );
}
