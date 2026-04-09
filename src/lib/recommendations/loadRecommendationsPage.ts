import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { createCoverAccessToken } from "@/lib/cover/coverToken";

export type RecommendationListRow = {
  bookId: string;
  score: number;
  reasons: unknown;
  seen: boolean;
  title: string;
  authors: unknown;
  coverUrl: string | null;
  coverToken: string | null;
};

export async function loadRecommendationsPage(args: {
  userId: string;
  limit: number;
  reasonCode?: string | null;
  cursor?: { score: number; bookId: string } | null;
}): Promise<{
  rows: RecommendationListRow[];
  nextCursor: { score: number; bookId: string } | null;
}> {
  const limit = Math.min(50, Math.max(1, args.limit));
  const reasonCode = args.reasonCode?.trim() || null;
  const cur = args.cursor;

  const reasonSql =
    reasonCode === null
      ? Prisma.sql`TRUE`
      : Prisma.sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(ur.reasons) AS r(elem)
          WHERE r.elem->>'code' = ${reasonCode}
        )`;

  const cursorSql =
    cur == null
      ? Prisma.sql`TRUE`
      : Prisma.sql`(ur.score < ${cur.score}::double precision OR (ur.score = ${cur.score}::double precision AND ur.book_id > ${cur.bookId}::uuid))`;

  const rows = await prisma.$queryRaw<
    Array<{
      book_id: string;
      score: number;
      reasons: unknown;
      seen: boolean;
      title: string;
      authors: unknown;
      cover_url: string | null;
    }>
  >`
    SELECT ur.book_id, ur.score, ur.reasons, ur.seen,
           b.title, b.authors, b.cover_url AS cover_url
    FROM user_recommendations ur
    INNER JOIN books b ON b.id = ur.book_id AND b.deleted_at IS NULL
    WHERE ur.user_id = ${args.userId}::uuid
      AND ur.dismissed = false
      AND ${reasonSql}
      AND ${cursorSql}
    ORDER BY ur.score DESC, ur.book_id ASC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor: { score: number; bookId: string } | null =
    hasMore && last ? { score: last.score, bookId: last.book_id } : null;

  const mapped: RecommendationListRow[] = page.map((r) => ({
    bookId: r.book_id,
    score: r.score,
    reasons: r.reasons,
    seen: r.seen,
    title: r.title,
    authors: r.authors,
    coverUrl: r.cover_url,
    coverToken: r.cover_url ? createCoverAccessToken(r.book_id) : null,
  }));

  return {
    rows: mapped,
    nextCursor,
  };
}
