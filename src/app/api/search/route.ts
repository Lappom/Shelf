import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { getClientIp, corsPreflight } from "@/lib/api/http";
import { asUuidOrThrow } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { join, sql, type Sql } from "@/lib/db/sql";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const SortSchema = z.enum([
  "relevance",
  "title",
  "added_at",
  "publish_date",
  "author",
  "progress",
  "page_count",
]);

const SortDirSchema = z.enum(["asc", "desc"]);

function splitCsvList(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function base64UrlEncodeJson(obj: unknown) {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecodeJson(s: string) {
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

const QuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
  mode: z.enum(["websearch", "plain"]).default("websearch"),
  sort: SortSchema.default("relevance"),
  dir: SortDirSchema.default("desc"),

  // Filters (multi-selects encoded as CSV in query params)
  formats: z.string().optional(),
  languages: z.string().optional(),
  tagIds: z.string().optional(),
  shelfId: z.string().uuid().optional(),
  statuses: z.string().optional(),

  author: z.string().trim().min(1).max(200).optional(),
  publisher: z.string().trim().min(1).max(255).optional(),

  addedFrom: z.string().trim().min(1).max(40).optional(),
  addedTo: z.string().trim().min(1).max(40).optional(),
  pagesMin: z.coerce.number().int().min(1).optional(),
  pagesMax: z.coerce.number().int().min(1).optional(),
});

function buildSearchQuerySql(mode: "websearch" | "plain", q: string) {
  if (mode === "plain") return sql`plainto_tsquery('simple', ${q})`;
  return sql`websearch_to_tsquery('simple', ${q})`;
}

function buildFiltersSql(args: {
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

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  return runApiRoute(
    req,
    {
      // Search is a sensitive endpoint; rate-limit it.
      auth: requireUser,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const userId = asUuidOrThrow((user as { id?: unknown } | null)?.id);
        await rateLimitOrThrow({ key: `search:${userId}:${ip}`, limit: 120, windowMs: 60_000 });
      },
    },
    async ({ req, user }) => {
      const userId = z
        .string()
        .uuid()
        .parse((user as { id?: unknown }).id);

      const url = new URL(req.url);
      const parsed = QuerySchema.safeParse({
        q: url.searchParams.get("q") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
        mode: url.searchParams.get("mode") ?? undefined,
        sort: url.searchParams.get("sort") ?? undefined,
        dir: url.searchParams.get("dir") ?? undefined,

        formats: url.searchParams.get("formats") ?? undefined,
        languages: url.searchParams.get("languages") ?? undefined,
        tagIds: url.searchParams.get("tagIds") ?? undefined,
        shelfId: url.searchParams.get("shelfId") ?? undefined,
        statuses: url.searchParams.get("statuses") ?? undefined,

        author: url.searchParams.get("author") ?? undefined,
        publisher: url.searchParams.get("publisher") ?? undefined,

        addedFrom: url.searchParams.get("addedFrom") ?? undefined,
        addedTo: url.searchParams.get("addedTo") ?? undefined,
        pagesMin: url.searchParams.get("pagesMin") ?? undefined,
        pagesMax: url.searchParams.get("pagesMax") ?? undefined,
      });
      if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

      const {
        q: qRaw,
        limit,
        cursor: cursorRaw,
        mode,
        sort,
        dir,
        formats,
        languages,
        tagIds,
        shelfId,
        statuses,
        author,
        publisher,
        addedFrom,
        addedTo,
        pagesMin,
        pagesMax,
      } = parsed.data;

      const q = (qRaw ?? "").trim();

      const formatsList = splitCsvList(formats);
      const languagesList = splitCsvList(languages).map((x) => x.toLowerCase());
      const tagIdsList = splitCsvList(tagIds);
      const statusesList = splitCsvList(statuses);

      const addedFromDate = addedFrom ? new Date(addedFrom) : undefined;
      const addedToDate = addedTo ? new Date(addedTo) : undefined;
      if (addedFromDate && !Number.isFinite(addedFromDate.getTime()))
        return NextResponse.json({ error: "Invalid query" }, { status: 400 });
      if (addedToDate && !Number.isFinite(addedToDate.getTime()))
        return NextResponse.json({ error: "Invalid query" }, { status: 400 });
      if (pagesMin != null && pagesMax != null && pagesMin > pagesMax)
        return NextResponse.json({ error: "Invalid query" }, { status: 400 });

      const whereFiltersSql = buildFiltersSql({
        userId,
        formats: formatsList,
        languages: languagesList,
        tagIds: tagIdsList,
        shelfId,
        statuses: statusesList,
        author,
        publisher,
        addedFrom: addedFromDate,
        addedTo: addedToDate,
        pagesMin,
        pagesMax,
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

      // Cursor decoding depends on sort.
      let cursorCondSql: Sql = sql`TRUE`;
      let cursorDecoded: unknown = null;
      if (cursorRaw) {
        try {
          cursorDecoded = base64UrlDecodeJson(cursorRaw);
        } catch {
          return NextResponse.json({ error: "Invalid query" }, { status: 400 });
        }
      }

      const dirSql = dir === "asc" ? sql`ASC` : sql`DESC`;

      let orderBySql: Sql;
      let sortValueSql: Sql = sql`NULL`;

      if (sort === "relevance") {
        // If no query, fall back to recent.
        if (!hasQuery) {
          sortValueSql = sql`b.created_at`;
          orderBySql = sql`b.created_at ${dirSql}, b.id ASC`;
          if (cursorDecoded) {
            const c = CursorValueSchema.safeParse(cursorDecoded);
            if (!c.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
            if (!c.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
            cursorCondSql = sql`(${rankSql} < ${c.data.rank} OR (${rankSql} = ${c.data.rank} AND b.id > ${c.data.id}::uuid))`;
          }
        }
      } else if (sort === "title") {
        sortValueSql = sql`LOWER(COALESCE(b.title, ''))`;
        orderBySql = sql`${sortValueSql} ${dirSql}, b.id ASC`;
        if (cursorDecoded) {
          const c = CursorValueSchema.safeParse(cursorDecoded);
          if (!c.success || typeof c.data.v !== "string")
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
          if (!c.success || typeof c.data.v !== "string")
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
          cursorCondSql =
            dir === "asc"
              ? sql`(b.created_at > ${c.data.v}::timestamptz OR (b.created_at = ${c.data.v}::timestamptz AND b.id > ${c.data.id}::uuid))`
              : sql`(b.created_at < ${c.data.v}::timestamptz OR (b.created_at = ${c.data.v}::timestamptz AND b.id > ${c.data.id}::uuid))`;
        }
      } else if (sort === "publish_date") {
        // Publish date is a free-form string in V1; stable sort via lowercased string with NULLs last.
        const nullFlagSql = sql`(b.publish_date IS NULL)`;
        sortValueSql = sql`LOWER(COALESCE(b.publish_date, ''))`;
        orderBySql = sql`${nullFlagSql} ASC, ${sortValueSql} ${dirSql}, b.id ASC`;
        if (cursorDecoded) {
          const c = CursorValueSchema.safeParse(cursorDecoded);
          if (!c.success || typeof c.data.v !== "string")
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
          if (!c.success || typeof c.data.v !== "string")
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
          if (!c.success || typeof c.data.v !== "number")
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
          cursorCondSql =
            dir === "asc"
              ? sql`(${sortValueSql} > ${c.data.v} OR (${sortValueSql} = ${c.data.v} AND b.id > ${c.data.id}::uuid))`
              : sql`(${sortValueSql} < ${c.data.v} OR (${sortValueSql} = ${c.data.v} AND b.id > ${c.data.id}::uuid))`;
        }
      } else {
        // page_count
        sortValueSql = sql`COALESCE(b.page_count, 0)`;
        orderBySql = sql`${sortValueSql} ${dirSql}, b.id ASC`;
        if (cursorDecoded) {
          const c = CursorValueSchema.safeParse(cursorDecoded);
          if (!c.success || typeof c.data.v !== "number")
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
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
     AND ubp.user_id = ${userId}::uuid
    WHERE
      ${whereFiltersSql}
      AND (${ftsMatchSql} OR ${fuzzyMatchSql})
      AND ${cursorCondSql}
    ORDER BY
      ${orderBySql}
    LIMIT ${limit};
  `;

      let nextCursor: string | null = null;
      if (results.length === limit) {
        const last = results[results.length - 1];
        if (last) {
          if (sort === "relevance" && hasQuery) {
            nextCursor = base64UrlEncodeJson({ kind: "relevance", rank: last.rank, id: last.id });
          } else {
            nextCursor = base64UrlEncodeJson({ kind: "value", v: last.sortValue, id: last.id });
          }
        }
      }

      // Strip internal fields from response
      const publicResults = results.map((r: (typeof results)[number]) => ({
        id: r.id,
        title: r.title,
        authors: r.authors,
        description: r.description,
        coverUrl: r.coverUrl,
        format: r.format,
        language: r.language,
        pageCount: r.pageCount,
        createdAt: r.createdAt.toISOString(),
        publishDate: r.publishDate,
        progress: r.progress,
      }));

      return NextResponse.json({ results: publicResults, nextCursor }, { status: 200 });
    },
  );
}
