import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import { scheduleRecommendationsRecompute } from "@/lib/recommendations/trigger";

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ bookId: z.string().uuid() });

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
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
          key: `shelves:add_book:${userId}:${ip}`,
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
      if (!parsedParams.success)
        return NextResponse.json({ error: "Invalid shelf id" }, { status: 400 });

      const json = await parseJsonBody(req);
      const parsedBody = BodySchema.safeParse(json);
      if (!parsedBody.success)
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

      const shelf = await prisma.shelf.findFirst({
        where: { id: parsedParams.data.id, ownerId: userId },
        select: { id: true, type: true },
      });
      if (!shelf) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (shelf.type === "reading" || shelf.type === "read")
        return NextResponse.json({ error: "Unsupported" }, { status: 400 });

      await prisma.bookShelf.upsert({
        where: { bookId_shelfId: { bookId: parsedBody.data.bookId, shelfId: shelf.id } },
        update: {},
        create: { bookId: parsedBody.data.bookId, shelfId: shelf.id },
      });

      if (shelf.type === "favorites") {
        scheduleRecommendationsRecompute(userId);
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    },
  );
}
