import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database, SqlValue } from "sql.js";

import type { CalibreBookRecord, CalibreParseResult } from "./types";

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

async function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs();
  }
  return sqlJsPromise;
}

function hasTable(db: Database, tableName: string) {
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1", [
    tableName,
  ] as SqlValue[]);
  return Boolean(res[0]?.values?.length);
}

function allRows<T extends Record<string, unknown>>(
  db: Database,
  sql: string,
  params: SqlValue[] = [],
) {
  const out: T[] = [];
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    while (stmt.step()) {
      out.push(stmt.getAsObject() as T);
    }
  } finally {
    stmt.free();
  }
  return out;
}

function normalizeString(v: unknown) {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

function normalizeUpper(v: unknown) {
  const s = normalizeString(v);
  return s ? s.toUpperCase() : null;
}

function normalizeBlob(v: unknown): Uint8Array | null {
  if (v == null) return null;
  // sql.js returns Uint8Array for blobs
  if (v instanceof Uint8Array) return v;
  return null;
}

export async function parseCalibreMetadataDb(bytes: Uint8Array): Promise<CalibreParseResult> {
  const SQL = await getSqlJs();
  const db = new SQL.Database(bytes);

  const warnings: string[] = [];
  try {
    const requiredTables = [
      "books",
      "authors",
      "books_authors_link",
      "tags",
      "books_tags_link",
      "data",
    ];
    for (const t of requiredTables) {
      if (!hasTable(db, t)) warnings.push(`Missing table: ${t}`);
    }

    const hasSeries = hasTable(db, "series");
    const hasCovers = hasTable(db, "covers");

    const books = allRows<{
      id: number;
      title: string | null;
      comments: string | null;
      path: string | null;
      series_name?: string | null;
    }>(
      db,
      hasSeries
        ? `
          SELECT b.id, b.title, b.comments, b.path, s.name AS series_name
          FROM books b
          LEFT JOIN series s ON s.id = b.series
        `
        : `
          SELECT b.id, b.title, b.comments, b.path
          FROM books b
        `,
    );

    const authors = allRows<{ book_id: number; author_name: string | null }>(
      db,
      `
        SELECT l.book AS book_id, a.name AS author_name
        FROM books_authors_link l
        JOIN authors a ON a.id = l.author
      `,
    );
    const tags = allRows<{ book_id: number; tag_name: string | null }>(
      db,
      `
        SELECT l.book AS book_id, t.name AS tag_name
        FROM books_tags_link l
        JOIN tags t ON t.id = l.tag
      `,
    );

    const epubData = allRows<{ book_id: number; file_name: string | null; format: string | null }>(
      db,
      `
        SELECT d.book AS book_id, d.name AS file_name, d.format AS format
        FROM data d
        WHERE UPPER(d.format) = 'EPUB'
      `,
    );

    const coverData = hasCovers
      ? allRows<{ book_id: number; cover_data: Uint8Array | null }>(
          db,
          `
            SELECT c.book AS book_id, c.data AS cover_data
            FROM covers c
          `,
        )
      : [];

    const authorsByBook = new Map<number, string[]>();
    for (const row of authors) {
      const name = normalizeString(row.author_name);
      if (!name) continue;
      const arr = authorsByBook.get(row.book_id) ?? [];
      arr.push(name);
      authorsByBook.set(row.book_id, arr);
    }

    const tagsByBook = new Map<number, string[]>();
    for (const row of tags) {
      const name = normalizeString(row.tag_name);
      if (!name) continue;
      const arr = tagsByBook.get(row.book_id) ?? [];
      arr.push(name);
      tagsByBook.set(row.book_id, arr);
    }

    const epubByBook = new Map<number, string>();
    for (const row of epubData) {
      if (normalizeUpper(row.format) !== "EPUB") continue;
      const name = normalizeString(row.file_name);
      if (!name) continue;
      epubByBook.set(row.book_id, name);
    }

    const coverByBook = new Map<number, Uint8Array>();
    for (const row of coverData) {
      const blob = normalizeBlob(row.cover_data);
      if (!blob) continue;
      coverByBook.set(row.book_id, blob);
    }

    const records: CalibreBookRecord[] = books.map((b) => {
      const title = normalizeString(b.title) ?? `#${b.id}`;
      return {
        calibreBookId: b.id,
        title,
        description: normalizeString(b.comments),
        calibrePath: normalizeString(b.path),
        seriesName: normalizeString(b.series_name),
        authors: authorsByBook.get(b.id) ?? [],
        tags: tagsByBook.get(b.id) ?? [],
        epubFileName: epubByBook.get(b.id) ?? null,
        coverImage: coverByBook.get(b.id) ?? null,
      };
    });

    return { books: records, warnings };
  } finally {
    db.close();
  }
}
