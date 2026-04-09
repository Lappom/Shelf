import { NextResponse } from "next/server";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  return runApiRoute(
    req,
    {
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = String((user as { id?: unknown }).id ?? "unknown");
        await rateLimitOrThrow({
          key: `admin:users:list:${adminId}:${ip}`,
          limit: 60,
          windowMs: 60_000,
        });
      },
    },
    async () => {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ createdAt: "asc" }],
        take: 500,
      });

      return NextResponse.json(
        {
          users: users.map((u) => ({
            id: u.id,
            email: u.email,
            username: u.username,
            role: u.role,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
          })),
        },
        { status: 200 },
      );
    },
  );
}
