import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const CreateShelfSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).nullable().optional(),
  icon: z.string().trim().max(50).nullable().optional(),
  type: z.enum(["manual", "dynamic"]),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  return runApiRoute(req, { auth: requireUser }, async ({ user }) => {
    const userId = z
      .string()
      .uuid()
      .parse((user as { id?: unknown }).id);

    const shelves = await prisma.shelf.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
        type: true,
        sortOrder: true,
        createdAt: true,
        _count: { select: { books: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(
      {
        shelves: shelves.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          icon: s.icon,
          type: s.type,
          sortOrder: s.sortOrder,
          createdAt: s.createdAt.toISOString(),
          booksCount: s._count.books,
        })),
      },
      { status: 200 },
    );
  });
}

export async function POST(req: Request) {
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
          key: `shelves:create:${userId}:${ip}`,
          limit: 60,
          windowMs: 60_000,
        });
      },
    },
    async ({ req, user }) => {
      const userId = z
        .string()
        .uuid()
        .parse((user as { id?: unknown }).id);

      const json = await parseJsonBody(req);
      const parsed = CreateShelfSchema.safeParse(json);
      if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

      const created = await prisma.shelf.create({
        data: {
          ownerId: userId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          icon: parsed.data.icon ?? null,
          type: parsed.data.type,
          sortOrder: 0,
        },
        select: { id: true },
      });

      if (parsed.data.type === "dynamic") {
        await prisma.shelfRule.create({
          data: {
            shelfId: created.id,
            rules: { match: "all", conditions: [] } as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
      }

      return NextResponse.json({ shelfId: created.id }, { status: 201 });
    },
  );
}
