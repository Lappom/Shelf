import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { sql, type Sql } from "@/lib/db/sql";
import { buildShelfRuleWhereSql, parseShelfRuleJson, type ShelfRule } from "@/lib/shelves/rules";

export const SHELF_BOOKS_PAGE_SIZE = 48;

export type ShelfDetailBookRow = {
  id: string;
  title: string;
  authors: string[];
  format: "epub" | "physical" | "pdf" | "cbz" | "cbr" | "audiobook";
  addedAt: string;
  createdAt: string;
  shelfSortOrder: number;
};

function normalizeAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors
    .filter((a): a is string => typeof a === "string" && Boolean(a.trim()))
    .map((a) => a.trim());
}

function base64UrlEncodeJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecodeJson(s: string): unknown {
  const normalized = s.replaceAll("-", "+").replaceAll("_", "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const json = Buffer.from(normalized + pad, "base64").toString("utf8");
  return JSON.parse(json) as unknown;
}

const ManualCursorSchema = z.object({
  k: z.literal("mf"),
  so: z.number().int(),
  ad: z.string(),
  bid: z.string().uuid(),
});

const ReadingCursorSchema = z.object({
  k: z.literal("rd"),
  u: z.string(),
  bid: z.string().uuid(),
});

const DynamicCursorSchema = z.object({
  k: z.literal("dy"),
  c: z.string(),
  bid: z.string().uuid(),
});

function encodeShelfBooksCursor(payload: z.infer<typeof ManualCursorSchema> | z.infer<typeof ReadingCursorSchema> | z.infer<typeof DynamicCursorSchema>): string {
  return base64UrlEncodeJson(payload);
}

export async function loadShelfBooksPage(args: {
  userId: string;
  shelfId: string;
  shelfType: "manual" | "dynamic" | "favorites" | "reading";
  rulesJson: unknown | null;
  cursor: string | null;
  limit?: number;
}): Promise<{ books: ShelfDetailBookRow[]; nextCursor: string | null }> {
  const limit = args.limit ?? SHELF_BOOKS_PAGE_SIZE;

  if (args.shelfType === "manual" || args.shelfType === "favorites") {
    let cursorSql: Sql = sql`TRUE`;
    if (args.cursor) {
      let decoded: unknown;
      try {
        decoded = base64UrlDecodeJson(args.cursor);
      } catch {
        return { books: [], nextCursor: null };
      }
      const c = ManualCursorSchema.safeParse(decoded);
      if (!c.success) return { books: [], nextCursor: null };
      cursorSql = sql`(
        bs.sort_order > ${c.data.so}
        OR (bs.sort_order = ${c.data.so} AND bs.added_at > ${c.data.ad}::timestamptz)
        OR (bs.sort_order = ${c.data.so} AND bs.added_at = ${c.data.ad}::timestamptz AND bs.book_id > ${c.data.bid}::uuid)
      )`;
    }

    const rows = await prisma.$queryRaw<
      Array<{
        sortOrder: number;
        addedAt: Date;
        id: string;
        title: string;
        authors: unknown;
        format: string;
        createdAt: Date;
      }>
    >`
      SELECT bs.sort_order AS "sortOrder", bs.added_at AS "addedAt",
             b.id, b.title, b.authors, b.format, b.created_at AS "createdAt"
      FROM book_shelves bs
      INNER JOIN books b ON b.id = bs.book_id
      WHERE bs.shelf_id = ${args.shelfId}::uuid
        AND b.deleted_at IS NULL
        AND ${cursorSql}
      ORDER BY bs.sort_order ASC, bs.added_at ASC, bs.book_id ASC
      LIMIT ${limit + 1};
    `;

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const books: ShelfDetailBookRow[] = page.map((r) => ({
      id: r.id,
      title: r.title,
      authors: normalizeAuthors(r.authors),
      format: r.format as ShelfDetailBookRow["format"],
      addedAt: r.addedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      shelfSortOrder: r.sortOrder,
    }));

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = page[page.length - 1];
      if (last) {
        nextCursor = encodeShelfBooksCursor({
          k: "mf",
          so: last.sortOrder,
          ad: last.addedAt.toISOString(),
          bid: last.id,
        });
      }
    }
    return { books, nextCursor };
  }

  if (args.shelfType === "reading") {
    let cursorSql: Sql = sql`TRUE`;
    if (args.cursor) {
      let decoded: unknown;
      try {
        decoded = base64UrlDecodeJson(args.cursor);
      } catch {
        return { books: [], nextCursor: null };
      }
      const c = ReadingCursorSchema.safeParse(decoded);
      if (!c.success) return { books: [], nextCursor: null };
      cursorSql = sql`(
        ubp.updated_at < ${c.data.u}::timestamptz
        OR (ubp.updated_at = ${c.data.u}::timestamptz AND b.id > ${c.data.bid}::uuid)
      )`;
    }

    const rows = await prisma.$queryRaw<
      Array<{
        updatedAt: Date;
        id: string;
        title: string;
        authors: unknown;
        format: string;
        createdAt: Date;
      }>
    >`
      SELECT ubp.updated_at AS "updatedAt",
             b.id, b.title, b.authors, b.format, b.created_at AS "createdAt"
      FROM user_book_progress ubp
      INNER JOIN books b ON b.id = ubp.book_id
      WHERE ubp.user_id = ${args.userId}::uuid
        AND ubp.status::text = 'reading'
        AND b.deleted_at IS NULL
        AND ${cursorSql}
      ORDER BY ubp.updated_at DESC, b.id ASC
      LIMIT ${limit + 1};
    `;

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const books: ShelfDetailBookRow[] = page.map((r) => ({
      id: r.id,
      title: r.title,
      authors: normalizeAuthors(r.authors),
      format: r.format as ShelfDetailBookRow["format"],
      addedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      shelfSortOrder: 0,
    }));

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = page[page.length - 1];
      if (last) {
        nextCursor = encodeShelfBooksCursor({
          k: "rd",
          u: last.updatedAt.toISOString(),
          bid: last.id,
        });
      }
    }
    return { books, nextCursor };
  }

  // dynamic
  let rule: ShelfRule;
  try {
    rule = parseShelfRuleJson(args.rulesJson);
  } catch {
    rule = { match: "all", conditions: [] };
  }
  const whereSql = buildShelfRuleWhereSql(rule);

  let cursorSql: Sql = sql`TRUE`;
  if (args.cursor) {
    let decoded: unknown;
    try {
      decoded = base64UrlDecodeJson(args.cursor);
    } catch {
      return { books: [], nextCursor: null };
    }
    const c = DynamicCursorSchema.safeParse(decoded);
    if (!c.success) return { books: [], nextCursor: null };
    cursorSql = sql`(
      b.created_at < ${c.data.c}::timestamptz
      OR (b.created_at = ${c.data.c}::timestamptz AND b.id > ${c.data.bid}::uuid)
    )`;
  }

  const rows = await prisma.$queryRaw<
    Array<{ id: string; title: string; authors: unknown; format: string; created_at: Date }>
  >`
    SELECT b.id, b.title, b.authors, b.format, b.created_at
    FROM books b
    WHERE b.deleted_at IS NULL
      AND ${whereSql}
      AND ${cursorSql}
    ORDER BY b.created_at DESC, b.id ASC
    LIMIT ${limit + 1};
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const books: ShelfDetailBookRow[] = page.map((r) => ({
    id: r.id,
    title: r.title,
    authors: normalizeAuthors(r.authors),
    format: r.format as ShelfDetailBookRow["format"],
    addedAt: r.created_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    shelfSortOrder: 0,
  }));

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = page[page.length - 1];
    if (last) {
      nextCursor = encodeShelfBooksCursor({
        k: "dy",
        c: last.created_at.toISOString(),
        bid: last.id,
      });
    }
  }
  return { books, nextCursor };
}
