import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import {
  ScanRequestSchema,
  scanHashCandidates,
  scanFuzzyCandidates,
  upsertDuplicatePairs,
} from "@/lib/admin/duplicates/scan";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  return runApiRoute(
    req,
    {
      sameOrigin: true,
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = (user as { id?: string } | null)?.id ?? "unknown";
        await rateLimitOrThrow({
          key: `admin:scan_duplicates:${adminId}:${ip}`,
          limit: 10,
          windowMs: 60_000,
        });
      },
    },
    async ({ req }) => {
      const json = await parseJsonBody(req);
      const parsed = ScanRequestSchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
      }

      const scannedAt = new Date();
      const maxPairs = parsed.data.maxPairs;

      const kind = parsed.data.mode;
      const threshold = parsed.data.fuzzyThreshold ?? 0.7;

      const candidates =
        kind === "hash"
          ? await scanHashCandidates({ maxPairs })
          : await scanFuzzyCandidates({ threshold, maxPairs });

      // Avoid writing pairs for books that were deleted between scan steps.
      const ids = new Set<string>();
      for (const c of candidates) {
        ids.add(c.bookIdA);
        ids.add(c.bookIdB);
      }
      const alive = await prisma.book.findMany({
        where: { id: { in: Array.from(ids) }, deletedAt: null },
        select: { id: true },
      });
      const aliveSet = new Set(alive.map((b) => b.id));
      const filtered = candidates.filter((c) => aliveSet.has(c.bookIdA) && aliveSet.has(c.bookIdB));

      const { created, updated } = await upsertDuplicatePairs({
        kind,
        candidates: filtered,
        scannedAt,
      });

      return NextResponse.json(
        {
          ok: true,
          mode: kind,
          threshold: kind === "fuzzy" ? threshold : null,
          scannedAt: scannedAt.toISOString(),
          candidates: candidates.length,
          persisted: filtered.length,
          created,
          updated,
        },
        { status: 200 },
      );
    },
  );
}
