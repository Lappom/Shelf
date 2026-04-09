import { z } from "zod";

import { createCoverAccessToken } from "@/lib/cover/coverToken";
import { prisma } from "@/lib/db/prisma";
import { join, sql, type Sql } from "@/lib/db/sql";

export const LibrarySortSchema = z.enum([
  "relevance",
  "title",
  "added_at",
  "publish_date",
  "author",
  "progress",
  "page_count",
]);

export const LibrarySortDirSchema = z.enum(["asc", "desc"]);

export function splitCsvList(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function base64UrlEncodeJson(obj: unknown) {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function base64UrlDecodeJson(s: string) {
  const normalized = s.replaceAll("-", "+").replaceAll("_", "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const json = Buffer.from(normalized + pad, "base64").toString("utf8");
  return JSON.parse(json) as unknown;
}

const CursorRelevanceSchema = z.object({
  kind: z.literal("relevance"),
  rank: z.number(),
  id: z.string().uuid(),
});
const CursorValueSchema = z.object({
  kind: z.literal("value"),
  v: z.union([z.string(), z.number(), z.boolean()]),
  id: z.string().uuid(),
});

export function buildSearchQuerySql(mode: "websearch" | "plain", q: string) {
  if (mode === "plain") return sql`plainto_tsquery('simple', ${q})`;
  return sql`websearch_to_tsquery('simple', ${q})`;
}

export function buildLibraryBookFiltersSql(args: {
  userId: string;
  formats: string[];
  languages: string[];
  tagIds: string[];
  shelfId?: string;
  statuses: string[];
  author?: string;
  publisher?: string;
  addedFrom?: Date;
  addedTo?: Date;
  pagesMin?: number;
  pagesMax?: number;
}): Sql {
  const conditions: Sql[] = [sql`b.deleted_at IS NULL`];

  if (args.formats.length) {
    conditions.push(sql`b.format IN (${join(args.formats)})`);
  }

  if (args.languages.length) {
    conditions.push(
      sql`LOWER(COALESCE(b.language, '')) IN (${join(args.languages.map((x) => sql`LOWER(${x})`))})`,
    );
  }

  if (args.tagIds.length) {
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM "book_tags" bt
        WHERE bt.book_id = b.id
          AND bt.tag_id IN (${join(args.tagIds)})
      )`,
    );
  }

  if (args.shelfId) {
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM "book_shelves" bs
        JOIN "shelves" s ON s.id = bs.shelf_id
        WHERE bs.book_id = b.id
          AND bs.shelf_id = ${args.shelfId}::uuid
          AND s.owner_id = ${args.userId}::uuid
      )`,
    );
  }

  if (args.statuses.length) {
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM "user_book_progress" ubp
        WHERE ubp.book_id = b.id
          AND ubp.user_id = ${args.userId}::uuid
          AND ubp.status IN (${join(args.statuses)})
      )`,
    );
  }

  if (args.author) {
    const needle = `%${args.author.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(b.authors::jsonb) AS elem(value)
        WHERE elem.value ILIKE ${needle} ESCAPE '\\'
      )`,
    );
  }

  if (args.publisher) {
    const needle = `%${args.publisher.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(sql`COALESCE(b.publisher, '') ILIKE ${needle} ESCAPE '\\'`);
  }

  if (args.addedFrom)
    conditions.push(sql`b.created_at >= ${args.addedFrom.toISOString()}::timestamptz`);
  if (args.addedTo)
    conditions.push(sql`b.created_at <= ${args.addedTo.toISOString()}::timestamptz`);

  if (args.pagesMin != null) conditions.push(sql`b.page_count >= ${args.pagesMin}`);
  if (args.pagesMax != null) conditions.push(sql`b.page_count <= ${args.pagesMax}`);

  return sql`${join(conditions, " AND ")}`;
}

export type LibrarySearchBookRow = {
  id: string;
  title: string;
  authors: unknown;
  description: string | null;
  coverUrl: string | null;
  coverToken: string | null;
  format: string;
  language: string | null;
  pageCount: number | null;
  createdAt: string;
  publishDate: string | null;
  progress: number | null;
};

export type SearchBooksForUserInput = {
  userId: string;
  q?: string;
  limit: number;
  /** Keyset cursor (ignored when `offset` is set). */
  cursor?: string | null;
  /** Offset pagination for MCP `list_books` (mutually exclusive with cursor in callers). */
  offset?: number;
  mode?: "websearch" | "plain";
  sort?: z.infer<typeof LibrarySortSchema>;
  dir?: z.infer<typeof LibrarySortDirSchema>;
  formats?: string[];
  languages?: string[];
  tagIds?: string[];
  shelfId?: string;
  statuses?: string[];
  author?: string;
  publisher?: string;
  addedFrom?: string;
  addedTo?: string;
  pagesMin?: number;
  pagesMax?: number;
};

export async function searchBooksForUser(
  input: SearchBooksForUserInput,
): Promise<
  | { ok: true; results: LibrarySearchBookRow[]; nextCursor: string | null }
  | { ok: false; error: string }
> {
  const mode = input.mode ?? "websearch";
  const sort = input.sort ?? "relevance";
  const dir = input.dir ?? "desc";
  const limit = input.limit;
  const offset = input.offset ?? 0;
  const cursorRaw = input.offset != null && input.offset > 0 ? undefined : (input.cursor ?? undefined);

  const q = (input.q ?? "").trim();

  const formatsList = input.formats ?? [];
  const languagesList = (input.languages ?? []).map((x) => x.toLowerCase());
  const tagIdsList = input.tagIds ?? [];
  const statusesList = input.statuses ?? [];

  const addedFromDate = input.addedFrom ? new Date(input.addedFrom) : undefined;
  const addedToDate = input.addedTo ? new Date(input.addedTo) : undefined;
  if (addedFromDate && !Number.isFinite(addedFromDate.getTime()))
    return { ok: false, error: "Invalid addedFrom" };
  if (addedToDate && !Number.isFinite(addedToDate.getTime()))
    return { ok: false, error: "Invalid addedTo" };
  if (input.pagesMin != null && input.pagesMax != null && input.pagesMin > input.pagesMax)
    return { ok: false, error: "Invalid page range" };

  const whereFiltersSql = buildLibraryBookFiltersSql({
    userId: input.userId,
    formats: formatsList,
    languages: languagesList,
    tagIds: tagIdsList,
    shelfId: input.shelfId,
    statuses: statusesList,
    author: input.author,
    publisher: input.publisher,
    addedFrom: addedFromDate,
    addedTo: addedToDate,
    pagesMin: input.pagesMin,
    pagesMax: input.pagesMax,
  });

  const hasQuery = q.length > 0;
  const tsQuerySql = hasQuery ? buildSearchQuerySql(mode, q) : sql`NULL`;
  const rankSql = hasQuery
    ? sql`ts_rank_cd(COALESCE(b.search_vector, to_tsvector('simple', '')), ${tsQuerySql})`
    : sql`0`;

  const ftsMatchSql = hasQuery
    ? sql`COALESCE(b.search_vector, to_tsvector('simple', '')) @@ ${tsQuerySql}`
    : sql`TRUE`;

  const fuzzyMatchSql = hasQuery ? sql`similarity(b.title, ${q}) > 0.2` : sql`FALSE`;

  let cursorCondSql: Sql = sql`TRUE`;
  let cursorDecoded: unknown = null;
  if (cursorRaw && offset === 0) {
    try {
      cursorDecoded = base64UrlDecodeJson(cursorRaw);
    } catch {
      return { ok: false, error: "Invalid cursor" };
    }
  }

  const dirSql = dir === "asc" ? sql`ASC` : sql`DESC`;

  let orderBySql: Sql;
  let sortValueSql: Sql = sql`NULL`;

  if (sort === "relevance") {
    if (!hasQuery) {
      sortValueSql = sql`b.created_at`;
      orderBySql = sql`b.created_at ${dirSql}, b.id ASC`;
      if (cursorDecoded) {
        const c = CursorValueSchema.safeParse(cursorDecoded);
        if (!c.success) return { ok: false, error: "Invalid cursor" };
        cursorCondSql =
          dir === "asc"
            ? sql`(b.created_at > ${String(c.data.v)}::timestamptz OR (b.created_at = ${String(c.data.v)}::timestamptz AND b.id > ${c.data.id}::uuid))`
            : sql`(b.created_at < ${String(c.data.v)}::timestamptz OR (b.created_at = ${String(c.data.v)}::timestamptz AND b.id > ${c.data.id}::uuid))`;
      }
    } else {
      sortValueSql = rankSql;
      orderBySql = sql`${rankSql} DESC, b.id ASC`;
      if (cursorDecoded) {
        const c = CursorRelevanceSchema.safeParse(cursorDecoded);
        if (!c.success) return { ok: false, error: "Invalid cursor" };
        cursorCondSql = sql`(${rankSql} < ${c.data.rank} OR (${rankSql} = ${c.data.rank} AND b.id > ${c.data.id}::uuid))`;
      }
    }
  } else if (sort === "title") {
    sortValueSql = sql`LOWER(COALESCE(b.title, ''))`;
    orderBySql = sql`${sortValueSql} ${dirSql}, b.id ASC`;
    if (cursorDecoded) {
      const c = CursorValueSchema.safeParse(cursorDecoded);
      if (!c.success || typeof c.data.v !== "string") return { ok: false, error: "Invalid cursor" };
      cursorCondSql =
        dir === "asc"
          ? sql`(${sortValueSql} > LOWER(${c.data.v}) OR (${sortValueSql} = LOWER(${c.data.v}) AND b.id > ${c.data.id}::uuid))`
          : sql`(${sortValueSql} < LOWER(${c.data.v}) OR (${sortValueSql} = LOWER(${c.data.v}) AND b.id > ${c.data.id}::uuid))`;
    }
  } else if (sort === "added_at") {
    sortValueSql = sql`b.created_at`;
    orderBySql = sql`${sortValueSql} ${dirSql}, b.id ASC`;
    if (cursorDecoded) {
      const c = CursorValueSchema.safeParse(cursorDecoded);
      if (!c.success || typeof c.data.v !== "string") return { ok: false, error: "Invalid cursor" };
      cursorCondSql =
        dir === "asc"
          ? sql`(b.created_at > ${c.data.v}::timestamptz OR (b.created_at = ${c.data.v}::timestamptz AND b.id > ${c.data.id}::uuid))`
          : sql`(b.created_at < ${c.data.v}::timestamptz OR (b.created_at = ${c.data.v}::timestamptz AND b.id > ${c.data.id}::uuid))`;
    }
  } else if (sort === "publish_date") {
    const nullFlagSql = sql`(b.publish_date IS NULL)`;
    sortValueSql = sql`LOWER(COALESCE(b.publish_date, ''))`;
    orderBySql = sql`${nullFlagSql} ASC, ${sortValueSql} ${dirSql}, b.id ASC`;
    if (cursorDecoded) {
      const c = CursorValueSchema.safeParse(cursorDecoded);
      if (!c.success || typeof c.data.v !== "string") return { ok: false, error: "Invalid cursor" };
      cursorCondSql =
        dir === "asc"
          ? sql`(${nullFlagSql} > FALSE OR (${nullFlagSql} = FALSE AND (${sortValueSql} > LOWER(${c.data.v}) OR (${sortValueSql} = LOWER(${c.data.v}) AND b.id > ${c.data.id}::uuid))))`
          : sql`(${nullFlagSql} > FALSE OR (${nullFlagSql} = FALSE AND (${sortValueSql} < LOWER(${c.data.v}) OR (${sortValueSql} = LOWER(${c.data.v}) AND b.id > ${c.data.id}::uuid))))`;
    }
  } else if (sort === "author") {
    sortValueSql = sql`LOWER(COALESCE(b.authors->>0, ''))`;
    orderBySql = sql`${sortValueSql} ${dirSql}, b.id ASC`;
    if (cursorDecoded) {
      const c = CursorValueSchema.safeParse(cursorDecoded);
      if (!c.success || typeof c.data.v !== "string") return { ok: false, error: "Invalid cursor" };
      cursorCondSql =
        dir === "asc"
          ? sql`(${sortValueSql} > LOWER(${c.data.v}) OR (${sortValueSql} = LOWER(${c.data.v}) AND b.id > ${c.data.id}::uuid))`
          : sql`(${sortValueSql} < LOWER(${c.data.v}) OR (${sortValueSql} = LOWER(${c.data.v}) AND b.id > ${c.data.id}::uuid))`;
    }
  } else if (sort === "progress") {
    sortValueSql = sql`COALESCE(ubp.progress, 0)`;
    orderBySql = sql`${sortValueSql} ${dirSql}, b.id ASC`;
    if (cursorDecoded) {
      const c = CursorValueSchema.safeParse(cursorDecoded);
      if (!c.success || typeof c.data.v !== "number") return { ok: false, error: "Invalid cursor" };
      cursorCondSql =
        dir === "asc"
          ? sql`(${sortValueSql} > ${c.data.v} OR (${sortValueSql} = ${c.data.v} AND b.id > ${c.data.id}::uuid))`
          : sql`(${sortValueSql} < ${c.data.v} OR (${sortValueSql} = ${c.data.v} AND b.id > ${c.data.id}::uuid))`;
    }
  } else {
    sortValueSql = sql`COALESCE(b.page_count, 0)`;
    orderBySql = sql`${sortValueSql} ${dirSql}, b.id ASC`;
    if (cursorDecoded) {
      const c = CursorValueSchema.safeParse(cursorDecoded);
      if (!c.success || typeof c.data.v !== "number") return { ok: false, error: "Invalid cursor" };
      cursorCondSql =
        dir === "asc"
          ? sql`(${sortValueSql} > ${c.data.v} OR (${sortValueSql} = ${c.data.v} AND b.id > ${c.data.id}::uuid))`
          : sql`(${sortValueSql} < ${c.data.v} OR (${sortValueSql} = ${c.data.v} AND b.id > ${c.data.id}::uuid))`;
    }
  }

  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      authors: unknown;
      description: string | null;
      coverUrl: string | null;
      format: string;
      language: string | null;
      pageCount: number | null;
      createdAt: Date;
      publishDate: string | null;
      progress: number | null;
      rank: number;
      sortValue: unknown;
    }>
  >`
    SELECT
      b.id,
      b.title,
      b.authors,
      b.description,
      b.cover_url AS "coverUrl",
      b.format,
      b.language,
      b.page_count AS "pageCount",
      b.created_at AS "createdAt",
      b.publish_date AS "publishDate",
      ubp.progress,
      ${rankSql} AS rank,
      ${sortValueSql} AS "sortValue"
    FROM "books" b
    LEFT JOIN "user_book_progress" ubp
      ON ubp.book_id = b.id
     AND ubp.user_id = ${input.userId}::uuid
    WHERE
      ${whereFiltersSql}
      AND (${ftsMatchSql} OR ${fuzzyMatchSql})
      AND ${cursorCondSql}
    ORDER BY
      ${orderBySql}
    LIMIT ${limit}
    OFFSET ${offset};
  `;

  let nextCursor: string | null = null;
  if (results.length === limit && offset === 0) {
    const last = results[results.length - 1];
    if (last) {
      if (sort === "relevance" && hasQuery) {
        nextCursor = base64UrlEncodeJson({ kind: "relevance", rank: last.rank, id: last.id });
      } else {
        nextCursor = base64UrlEncodeJson({ kind: "value", v: last.sortValue, id: last.id });
      }
    }
  }

  const publicResults: LibrarySearchBookRow[] = results.map((r) => {
    const coverToken = r.coverUrl ? createCoverAccessToken(r.id) : null;
    return {
      id: r.id,
      title: r.title,
      authors: r.authors,
      description: r.description,
      coverUrl: r.coverUrl,
      coverToken,
      format: r.format,
      language: r.language,
      pageCount: r.pageCount,
      createdAt: r.createdAt.toISOString(),
      publishDate: r.publishDate,
      progress: r.progress,
    };
  });

  return { ok: true, results: publicResults, nextCursor };
}
