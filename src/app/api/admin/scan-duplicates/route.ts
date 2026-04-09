import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { handleCorsPreflight, addCorsHeaders } from "@/lib/security/cors";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import {
  ScanRequestSchema,
  scanHashCandidates,
  scanFuzzyCandidates,
  upsertDuplicatePairs,
} from "@/lib/admin/duplicates/scan";

export async function OPTIONS(req: Request) {
  const preflight = handleCorsPreflight(req);
  return preflight ?? new Response(null, { status: 204 });
}

export async function POST(req: Request) {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  assertSameOriginFromHeaders({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
  });

  const admin = await requireAdmin();
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = ScanRequestSchema.safeParse(json);
  if (!parsed.success) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid body" }, { status: 400 }), req);
  }

  try {
    await rateLimitOrThrow({
      key: `admin:scan_duplicates:${admin.id}:${parsed.data.mode}:${ip}`,
      limit: 10,
      windowMs: 60_000,
    });
  } catch {
    return addCorsHeaders(NextResponse.json({ error: "Too many requests" }, { status: 429 }), req);
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

  return addCorsHeaders(
    NextResponse.json({
      ok: true,
      mode: kind,
      threshold: kind === "fuzzy" ? threshold : null,
      scannedAt: scannedAt.toISOString(),
      candidates: candidates.length,
      persisted: filtered.length,
      created,
      updated,
    }),
    req,
  );
}
