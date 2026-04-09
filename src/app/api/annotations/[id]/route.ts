import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

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
  return corsPreflight(req);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
          key: `annotations:patch:${userId}:${ip}`,
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
        return NextResponse.json({ error: "Invalid annotation id" }, { status: 400 });
      }

      const body = await parseJsonBody(req);
      const parsedBody = PatchBodySchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }

      const existing = await prisma.userAnnotation.findFirst({
        where: { id: parsedParams.data.id, userId },
        select: { id: true },
      });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

      return NextResponse.json(updated, { status: 200 });
    },
  );
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
          key: `annotations:delete:${userId}:${ip}`,
          limit: 120,
          windowMs: 60_000,
        });
      },
    },
    async ({ user }) => {
      const userId = z
        .string()
        .uuid()
        .parse((user as { id?: unknown }).id);
      const parsedParams = ParamsSchema.safeParse(await ctx.params);
      if (!parsedParams.success) {
        return NextResponse.json({ error: "Invalid annotation id" }, { status: 400 });
      }

      const existing = await prisma.userAnnotation.findFirst({
        where: { id: parsedParams.data.id, userId },
        select: { id: true },
      });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

      await prisma.userAnnotation.delete({ where: { id: parsedParams.data.id } });
      return new Response(null, { status: 204 });
    },
  );
}
