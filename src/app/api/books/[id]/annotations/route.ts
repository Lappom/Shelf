import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { handleCorsPreflight, addCorsHeaders } from "@/lib/security/cors";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";

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
  const preflight = handleCorsPreflight(req);
  return preflight ?? new Response(null, { status: 204 });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsedParams = ParamsSchema.safeParse(await ctx.params);
  if (!parsedParams.success) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid book id" }, { status: 400 }), req);
  }

  const url = new URL(req.url);
  const parsedQuery = GetQuerySchema.safeParse({
    type: url.searchParams.get("type") ?? undefined,
  });
  if (!parsedQuery.success) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid query" }, { status: 400 }), req);
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

  return addCorsHeaders(NextResponse.json({ annotations: rows }, { status: 200 }), req);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  assertSameOriginFromHeaders({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
  });

  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsedParams = ParamsSchema.safeParse(await ctx.params);
  if (!parsedParams.success) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid book id" }, { status: 400 }), req);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return addCorsHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), req);
  }

  const parsedBody = PostBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid payload" }, { status: 400 }), req);
  }

  const book = await prisma.book.findFirst({
    where: { id: parsedParams.data.id, deletedAt: null },
    select: { id: true, format: true },
  });
  if (!book) return addCorsHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }), req);
  if (book.format !== "epub") {
    return addCorsHeaders(NextResponse.json({ error: "Not an EPUB" }, { status: 400 }), req);
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

  return addCorsHeaders(NextResponse.json(created, { status: 201 }), req);
}
