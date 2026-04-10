import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({ id: z.string().uuid(), bookId: z.string().uuid() });

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; bookId: string }> },
) {
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
          key: `shelves:remove_book:${userId}:${ip}`,
          limit: 240,
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
        return NextResponse.json({ error: "Invalid params" }, { status: 400 });

      const shelf = await prisma.shelf.findFirst({
        where: { id: parsedParams.data.id, ownerId: userId },
        select: { id: true, type: true },
      });
      if (!shelf) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (shelf.type === "reading" || shelf.type === "read")
        return NextResponse.json({ error: "Unsupported" }, { status: 400 });

      await prisma.bookShelf.deleteMany({
        where: { shelfId: shelf.id, bookId: parsedParams.data.bookId },
      });

      return new Response(null, { status: 204 });
    },
  );
}
