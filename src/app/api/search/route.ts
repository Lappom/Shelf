import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export async function GET(req: Request) {
  await requireUser();

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get("q"),
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const { q, limit, cursor } = parsed.data;

  // Minimal implementation: use Postgres full-text query against a computed vector.
  // For now, vector can be NULL for existing rows; later phases will maintain it consistently.
  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      authors: unknown;
      description: string | null;
    }>
  >`
    SELECT
      b.id,
      b.title,
      b.authors,
      b.description
    FROM "books" b
    WHERE
      b.deleted_at IS NULL
      AND (
        COALESCE(b.search_vector, to_tsvector('simple', '')) @@ websearch_to_tsquery('simple', ${q})
        OR similarity(b.title, ${q}) > 0.2
      )
      AND (${cursor}::uuid IS NULL OR b.id > ${cursor}::uuid)
    ORDER BY
      ts_rank_cd(COALESCE(b.search_vector, to_tsvector('simple', '')), websearch_to_tsquery('simple', ${q})) DESC,
      b.id ASC
    LIMIT ${limit};
  `;

  const nextCursor = results.length === limit ? results[results.length - 1]?.id : null;
  return NextResponse.json({ results, nextCursor });
}
