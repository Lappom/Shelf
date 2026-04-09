import { z } from "zod";

import { prisma } from "@/lib/db/prisma";

export const ScanModeSchema = z.enum(["hash", "fuzzy"]);

export const ScanRequestSchema = z.object({
  mode: ScanModeSchema,
  fuzzyThreshold: z.number().min(0.3).max(0.95).optional(),
  maxPairs: z.number().int().min(1).max(20000).optional(),
});

export type DuplicateCandidate = {
  bookIdA: string;
  bookIdB: string;
  score: number | null;
};

function orderPair(a: string, b: string) {
  return a < b ? ([a, b] as const) : ([b, a] as const);
}

export async function scanHashCandidates(opts?: { maxPairs?: number }) {
  const maxPairs = opts?.maxPairs ?? 20000;

  const groups = await prisma.$queryRaw<Array<{ contentHash: string; bookIds: string[] }>>`
    SELECT
      bf.content_hash AS "contentHash",
      ARRAY_AGG(DISTINCT bf.book_id ORDER BY bf.book_id) AS "bookIds"
    FROM "book_files" bf
    JOIN "books" b ON b.id = bf.book_id
    WHERE
      b.deleted_at IS NULL
      AND bf.content_hash IS NOT NULL
      AND bf.content_hash <> ''
    GROUP BY bf.content_hash
    HAVING COUNT(DISTINCT bf.book_id) > 1
  `;

  const out: DuplicateCandidate[] = [];
  for (const g of groups) {
    const ids = g.bookIds ?? [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [bookIdA, bookIdB] = orderPair(ids[i]!, ids[j]!);
        out.push({ bookIdA, bookIdB, score: null });
        if (out.length >= maxPairs) return out;
      }
    }
  }

  return out;
}

export async function scanFuzzyCandidates(opts: { threshold: number; maxPairs?: number }) {
  const threshold = opts.threshold;
  const maxPairs = opts.maxPairs ?? 5000;

  // Candidate generation tries to avoid O(n^2) by using pg_trgm % operator on titles as a prefilter,
  // then computing a richer similarity that includes authors.
  const rows = await prisma.$queryRaw<Array<{ bookIdA: string; bookIdB: string; score: number }>>`
    WITH active AS (
      SELECT
        b.id,
        LOWER(b.title) AS title_lc,
        LOWER(
          COALESCE(
            (SELECT STRING_AGG(e.value, ' ' ORDER BY e.ord)
             FROM JSONB_ARRAY_ELEMENTS_TEXT(b.authors) WITH ORDINALITY AS e(value, ord)),
            ''
          )
        ) AS authors_lc
      FROM "books" b
      WHERE b.deleted_at IS NULL
    ),
    pairs AS (
      SELECT
        a1.id AS "bookIdA",
        a2.id AS "bookIdB",
        similarity(a1.title_lc || ' ' || a1.authors_lc, a2.title_lc || ' ' || a2.authors_lc) AS score
      FROM active a1
      JOIN active a2
        ON a1.id < a2.id
       AND a1.title_lc % a2.title_lc
       AND LEFT(a1.title_lc, 1) = LEFT(a2.title_lc, 1)
       AND ABS(LENGTH(a1.title_lc) - LENGTH(a2.title_lc)) <= 20
    )
    SELECT "bookIdA", "bookIdB", score
    FROM pairs
    WHERE score >= ${threshold}
    ORDER BY score DESC, "bookIdA" ASC, "bookIdB" ASC
    LIMIT ${maxPairs}
  `;

  return rows.map((r) => {
    const [bookIdA, bookIdB] = orderPair(r.bookIdA, r.bookIdB);
    return { bookIdA, bookIdB, score: r.score };
  });
}

export async function upsertDuplicatePairs(args: {
  kind: "hash" | "fuzzy";
  candidates: DuplicateCandidate[];
  scannedAt: Date;
}) {
  let created = 0;
  let updated = 0;

  for (const c of args.candidates) {
    const where = {
      kind_bookIdA_bookIdB: {
        kind: args.kind,
        bookIdA: c.bookIdA,
        bookIdB: c.bookIdB,
      },
    } as const;

    const existing = await prisma.duplicatePair.findUnique({
      where,
      select: { id: true, status: true },
    });

    if (!existing) {
      await prisma.duplicatePair.create({
        data: {
          kind: args.kind,
          status: "open",
          bookIdA: c.bookIdA,
          bookIdB: c.bookIdB,
          score: c.score ?? undefined,
          lastScannedAt: args.scannedAt,
        },
      });
      created++;
      continue;
    }

    // Never reopen ignored/merged pairs automatically; only refresh scan timestamp and score.
    await prisma.duplicatePair.update({
      where: { id: existing.id },
      data: {
        lastScannedAt: args.scannedAt,
        score: c.score ?? undefined,
      },
    });
    updated++;
  }

  return { created, updated };
}
