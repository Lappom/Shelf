import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import { sanitizePlainText } from "@/lib/security/sanitize";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const GetQuerySchema = z.object({
  type: z.enum(["highlight", "note", "bookmark"]).optional(),
});

const ColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/);

const PostBodySchema = z.object({
  type: z.enum(["highlight", "note", "bookmark"]),
  cfiRange: z.string().min(1).max(10_000),
  content: z.string().max(50_000).nullable().optional(),
  note: z.string().max(50_000).nullable().optional(),
  color: ColorSchema.nullable().optional(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runApiRoute(req, { auth: requireUser }, async ({ req, user }) => {
    const userId = z
      .string()
      .uuid()
      .parse((user as { id?: unknown }).id);
    const parsedParams = ParamsSchema.safeParse(await ctx.params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
    }

    const url = new URL(req.url);
    const parsedQuery = GetQuerySchema.safeParse({
      type: url.searchParams.get("type") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const rows = await prisma.userAnnotation.findMany({
      where: {
        userId,
        bookId: parsedParams.data.id,
        ...(parsedQuery.data.type ? { type: parsedQuery.data.type as never } : {}),
      },
      select: {
        id: true,
        type: true,
        cfiRange: true,
        content: true,
        note: true,
        color: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: "asc" }],
      take: 2000,
    });

    const annotations = rows.map((r) => ({
      ...r,
      content: r.content != null ? sanitizePlainText(r.content, { maxLen: 50_000 }) : null,
      note: r.note != null ? sanitizePlainText(r.note, { maxLen: 50_000 }) : null,
    }));

    return NextResponse.json({ annotations }, { status: 200 });
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
          key: `annotations:create:${userId}:${ip}`,
          limit: 120,
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
      const parsedBody = PostBodySchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }

      const book = await prisma.book.findFirst({
        where: { id: parsedParams.data.id, deletedAt: null },
        select: { id: true, format: true },
      });
      if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (book.format !== "epub") {
        return NextResponse.json({ error: "Not an EPUB" }, { status: 400 });
      }

      const created = await prisma.userAnnotation.create({
        data: {
          userId,
          bookId: parsedParams.data.id,
          type: parsedBody.data.type as never,
          cfiRange: parsedBody.data.cfiRange,
          content: parsedBody.data.content ?? null,
          note: parsedBody.data.note ?? null,
          color: parsedBody.data.color ?? null,
        },
        select: {
          id: true,
          type: true,
          cfiRange: true,
          content: true,
          note: true,
          color: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return NextResponse.json(created, { status: 201 });
    },
  );
}
