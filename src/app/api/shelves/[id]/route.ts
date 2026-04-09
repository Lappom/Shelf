import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({ id: z.string().uuid() });

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    icon: z.string().trim().max(50).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty payload" });

async function getOwnedShelfOrThrow(userId: string, shelfId: string) {
  const shelf = await prisma.shelf.findFirst({
    where: { id: shelfId, ownerId: userId },
    select: { id: true, type: true },
  });
  if (!shelf) throw new Error("NOT_FOUND");
  if (shelf.type === "favorites" || shelf.type === "reading") throw new Error("SYSTEM_SHELF");
  return shelf;
}

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
          key: `shelves:update:${userId}:${ip}`,
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
      if (!parsedParams.success)
        return NextResponse.json({ error: "Invalid shelf id" }, { status: 400 });

      const shelf = await getOwnedShelfOrThrow(userId, parsedParams.data.id);

      const json = await parseJsonBody(req);
      const parsed = PatchSchema.safeParse(json);
      if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

      await prisma.shelf.update({
        where: { id: shelf.id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          icon: parsed.data.icon,
        },
        select: { id: true },
      });

      return NextResponse.json({ ok: true }, { status: 200 });
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
          key: `shelves:delete:${userId}:${ip}`,
          limit: 60,
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
      if (!parsedParams.success)
        return NextResponse.json({ error: "Invalid shelf id" }, { status: 400 });

      const shelf = await getOwnedShelfOrThrow(userId, parsedParams.data.id);

      await prisma.$transaction(async (tx) => {
        await tx.bookShelf.deleteMany({ where: { shelfId: shelf.id } });
        await tx.shelfRule.deleteMany({ where: { shelfId: shelf.id } });
        await tx.shelf.delete({ where: { id: shelf.id } });
      });

      return NextResponse.json({ ok: true }, { status: 200 });
    },
  );
}
