import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime().optional(),
  beforeId: z.string().uuid().optional(),
});

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
          key: `admin:audit_logs:${adminId}:${ip}`,
          limit: 120,
          windowMs: 60_000,
        });
      },
    },
    async ({ req }) => {
      const url = new URL(req.url);
      const parsed = QuerySchema.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
        beforeId: url.searchParams.get("beforeId") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid query" }, { status: 400 });
      }

      const { limit, before, beforeId } = parsed.data;

      const where =
        before && beforeId
          ? {
              OR: [
                { createdAt: { lt: new Date(before) } },
                {
                  AND: [{ createdAt: new Date(before) }, { id: { lt: beforeId } }],
                },
              ],
            }
          : before
            ? { createdAt: { lt: new Date(before) } }
            : {};

      const rows = await prisma.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          action: true,
          actorId: true,
          meta: true,
          createdAt: true,
        },
      });

      const last = rows[rows.length - 1];
      const nextCursor =
        last && rows.length === limit
          ? { before: last.createdAt.toISOString(), beforeId: last.id }
          : null;

      return NextResponse.json(
        {
          logs: rows.map((r) => ({
            id: r.id,
            action: r.action,
            actorId: r.actorId,
            meta: r.meta,
            createdAt: r.createdAt.toISOString(),
          })),
          nextCursor,
        },
        { status: 200 },
      );
    },
  );
}
