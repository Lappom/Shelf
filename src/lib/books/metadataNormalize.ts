import { normalizeIsbn } from "@/lib/books/isbn";

import { type SyncMetadata, SyncMetadataSchema } from "./syncMetadataSchema";

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeNullableInt(v: unknown) {
  if (v == null) return null;
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n <= 0) return null;
  return n;
}

/**
 * Collapse whitespace, dedupe case-insensitively (first wins), sort for stable equality.
 */
function normalizeStringList(values: string[], max: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const s = normalizeWhitespace(raw);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  out.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return out.slice(0, max);
}

function normalizeIsbnPair(isbn10: string | null, isbn13: string | null) {
  const a = normalizeIsbn(isbn10 ?? undefined);
  const b = normalizeIsbn(isbn13 ?? undefined);
  let out10: string | null = null;
  let out13: string | null = null;
  if (a?.length === 10) out10 = a;
  if (a?.length === 13) out13 = a;
  if (b?.length === 13) out13 = b;
  if (b?.length === 10) out10 = out10 ?? b;
  return { isbn10: out10, isbn13: out13 };
}

/**
 * Normalize BCP47-like language tags to a short stable form (lowercase, primary subtag).
 */
export function normalizeLanguageTag(code: string | null): string | null {
  if (!code) return null;
  const t = code.trim();
  if (!t) return null;
  const first = t.split(/[,;/|]/)[0]?.trim() ?? t;
  const lower = first.toLowerCase().replace(/_/g, "-");
  if (/^[a-z]{2,3}(-[a-z]{2})?$/.test(lower)) return lower;
  if (/^[a-z]{2,3}$/.test(lower)) return lower;
  return lower.slice(0, 24) || null;
}

/**
 * Normalize publish date strings: trim, prefer YYYY or YYYY-MM-DD when parseable.
 */
export function normalizePublishDateString(raw: string | null): string | null {
  if (!raw) return null;
  const s = normalizeWhitespace(raw);
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return s;
  return s.slice(0, 50);
}

/**
 * Deterministic normalization for three-way merge inputs (EPUB, DB, snapshot).
 */
export function normalizeSyncMetadata(meta: SyncMetadata): SyncMetadata {
  const base = SyncMetadataSchema.parse(meta);
  const { isbn10, isbn13 } = normalizeIsbnPair(base.isbn10, base.isbn13);

  return {
    title: base.title ? normalizeWhitespace(base.title).slice(0, 500) : null,
    authors: normalizeStringList(base.authors, 200),
    language: normalizeLanguageTag(base.language),
    description: base.description ? normalizeWhitespace(base.description) : null,
    isbn10,
    isbn13,
    publisher: base.publisher ? normalizeWhitespace(base.publisher).slice(0, 255) : null,
    publishDate: normalizePublishDateString(base.publishDate),
    subjects: normalizeStringList(base.subjects, 200),
    pageCount: normalizeNullableInt(base.pageCount),
    openLibraryId: base.openLibraryId
      ? normalizeWhitespace(base.openLibraryId).slice(0, 50)
      : null,
  };
}
