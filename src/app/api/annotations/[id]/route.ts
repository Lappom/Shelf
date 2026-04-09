import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { handleCorsPreflight, addCorsHeaders } from "@/lib/security/cors";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const ColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/);

const PatchBodySchema = z
  .object({
    content: z.string().max(50_000).nullable().optional(),
    note: z.string().max(50_000).nullable().optional(),
    color: ColorSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty payload" });

export async function OPTIONS(req: Request) {
  const preflight = handleCorsPreflight(req);
  return preflight ?? new Response(null, { status: 204 });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    return addCorsHeaders(
      NextResponse.json({ error: "Invalid annotation id" }, { status: 400 }),
      req,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return addCorsHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }), req);
  }

  const parsedBody = PatchBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid payload" }, { status: 400 }), req);
  }

  const existing = await prisma.userAnnotation.findFirst({
    where: { id: parsedParams.data.id, userId },
    select: { id: true },
  });
  if (!existing)
    return addCorsHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }), req);

  const updated = await prisma.userAnnotation.update({
    where: { id: parsedParams.data.id },
    data: {
      content: parsedBody.data.content !== undefined ? parsedBody.data.content : undefined,
      note: parsedBody.data.note !== undefined ? parsedBody.data.note : undefined,
      color: parsedBody.data.color !== undefined ? parsedBody.data.color : undefined,
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

  return addCorsHeaders(NextResponse.json(updated, { status: 200 }), req);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    return addCorsHeaders(
      NextResponse.json({ error: "Invalid annotation id" }, { status: 400 }),
      req,
    );
  }

  const existing = await prisma.userAnnotation.findFirst({
    where: { id: parsedParams.data.id, userId },
    select: { id: true },
  });
  if (!existing)
    return addCorsHeaders(NextResponse.json({ error: "Not found" }, { status: 404 }), req);

  await prisma.userAnnotation.delete({ where: { id: parsedParams.data.id } });
  return addCorsHeaders(new Response(null, { status: 204 }), req);
}
