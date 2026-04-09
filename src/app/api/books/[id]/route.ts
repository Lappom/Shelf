import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { handleCorsPreflight, addCorsHeaders } from "@/lib/security/cors";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function OPTIONS(req: Request) {
  const preflight = handleCorsPreflight(req);
  return preflight ?? new Response(null, { status: 204 });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  assertSameOriginFromHeaders({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
  });

  const admin = await requireAdmin();
  const params = await ctx.params;
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid book id" }, { status: 400 }), req);
  }

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  try {
    await rateLimitOrThrow({ key: `books:soft_delete:${admin.id}:${ip}`, limit: 30, windowMs: 60_000 });
  } catch {
    return addCorsHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), req);
  }

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.id },
    select: { id: true, deletedAt: true },
  });
  if (!book) {
    return addCorsHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }), req);
  }

  if (!book.deletedAt) {
    await prisma.book.update({
      where: { id: book.id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  }

  return addCorsHeaders(NextResponse.json({ ok: true }, { status: 200 }), req);
}

