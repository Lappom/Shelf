import { prisma } from "@/lib/db/prisma";
import { createCoverAccessToken } from "@/lib/cover/coverToken";
import { buildShelfRuleWhereSql, parseShelfRuleJson, type ShelfRule } from "@/lib/shelves/rules";

/** Max covers shown on each shelf tile on /shelves */
export const SHELF_LIST_COVER_PREVIEW_LIMIT = 8;

export type ShelfCoverPreviewBook = {
  id: string;
  coverUrl: string | null;
  coverToken: string | null;
};

function toPreviewRows(
  rows: Array<{ id: string; coverUrl: string | null }>,
): ShelfCoverPreviewBook[] {
  return rows.map((r) => ({
    id: r.id,
    coverUrl: r.coverUrl,
    coverToken: r.coverUrl ? createCoverAccessToken(r.id) : null,
  }));
}

async function previewManualOrFavoritesShelf(shelfId: string): Promise<ShelfCoverPreviewBook[]> {
  const limit = SHELF_LIST_COVER_PREVIEW_LIMIT;
  const rows = await prisma.$queryRaw<Array<{ id: string; coverUrl: string | null }>>`
    SELECT b.id, b.cover_url AS "coverUrl"
    FROM book_shelves bs
    INNER JOIN books b ON b.id = bs.book_id
    WHERE bs.shelf_id = ${shelfId}::uuid
      AND b.deleted_at IS NULL
    ORDER BY bs.sort_order ASC, bs.added_at ASC, bs.book_id ASC
    LIMIT ${limit};
  `;
  return toPreviewRows(rows);
}

async function previewReadingShelf(userId: string): Promise<ShelfCoverPreviewBook[]> {
  const limit = SHELF_LIST_COVER_PREVIEW_LIMIT;
  const rows = await prisma.$queryRaw<Array<{ id: string; coverUrl: string | null }>>`
    SELECT b.id, b.cover_url AS "coverUrl"
    FROM user_book_progress ubp
    INNER JOIN books b ON b.id = ubp.book_id
    WHERE ubp.user_id = ${userId}::uuid
      AND ubp.status::text = 'reading'
      AND b.deleted_at IS NULL
    ORDER BY ubp.updated_at DESC, b.id ASC
    LIMIT ${limit};
  `;
  return toPreviewRows(rows);
}

async function previewDynamicShelf(rulesJson: unknown | null): Promise<ShelfCoverPreviewBook[]> {
  let rule: ShelfRule;
  try {
    rule = parseShelfRuleJson(rulesJson);
  } catch {
    return [];
  }
  const whereSql = buildShelfRuleWhereSql(rule);
  const limit = SHELF_LIST_COVER_PREVIEW_LIMIT;
  const rows = await prisma.$queryRaw<Array<{ id: string; coverUrl: string | null }>>`
    SELECT b.id, b.cover_url AS "coverUrl"
    FROM books b
    WHERE b.deleted_at IS NULL
      AND ${whereSql}
    ORDER BY b.created_at DESC, b.id ASC
    LIMIT ${limit};
  `;
  return toPreviewRows(rows);
}

/**
 * Loads a small set of book covers per shelf for the /shelves grid (authenticated owner).
 */
export async function loadShelfCoverPreviewsForList(args: {
  userId: string;
  shelves: Array<{
    id: string;
    type: "manual" | "dynamic" | "favorites" | "reading";
    rulesJson: unknown | null;
  }>;
}): Promise<Record<string, ShelfCoverPreviewBook[]>> {
  const entries = await Promise.all(
    args.shelves.map(async (s) => {
      let previews: ShelfCoverPreviewBook[];
      switch (s.type) {
        case "manual":
        case "favorites":
          previews = await previewManualOrFavoritesShelf(s.id);
          break;
        case "reading":
          previews = await previewReadingShelf(args.userId);
          break;
        case "dynamic":
          previews = await previewDynamicShelf(s.rulesJson);
          break;
        default:
          previews = [];
      }
      return [s.id, previews] as const;
    }),
  );
  return Object.fromEntries(entries);
}
