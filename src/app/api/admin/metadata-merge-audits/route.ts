import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const QuerySchema = z.object({
  bookId: z.string().uuid().optional(),
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
          key: `admin:metadata_merge_audits:${adminId}:${ip}`,
          limit: 120,
          windowMs: 60_000,
        });
      },
    },
    async ({ req }) => {
      const url = new URL(req.url);
      const parsed = QuerySchema.safeParse({
        bookId: url.searchParams.get("bookId") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
        beforeId: url.searchParams.get("beforeId") ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid query" }, { status: 400 });
      }

      const { bookId, limit, before, beforeId } = parsed.data;

      const cursorWhere =
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

      const where = bookId ? { bookId, ...cursorWhere } : cursorWhere;

      const rows = await prisma.metadataMergeResolutionAudit.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          bookId: true,
          actorId: true,
          snapshotSyncedAtIso: true,
          writeback: true,
          oldContentHash: true,
          newContentHash: true,
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
          audits: rows.map((r) => ({
            id: r.id,
            bookId: r.bookId,
            actorId: r.actorId,
            snapshotSyncedAtIso: r.snapshotSyncedAtIso,
            writeback: r.writeback,
            oldContentHash: r.oldContentHash,
            newContentHash: r.newContentHash,
            createdAt: r.createdAt.toISOString(),
          })),
          nextCursor,
        },
        { status: 200 },
      );
    },
  );
}
