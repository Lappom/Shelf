import { createHash } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { buildBookFileStoragePath } from "@/lib/storage/paths";
import { extractEpubMetadata, writeEpubOpfMetadata, type EpubMetadata } from "@/lib/epub";
import { updateBookSearchVector } from "@/lib/search/searchVector";

const MAX_BYTES_DEFAULT = 100 * 1024 * 1024;

function getMaxEpubBytesForSync() {
  const raw = process.env.UPLOAD_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return MAX_BYTES_DEFAULT;
}

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeNullableString(v: unknown) {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const s = normalizeWhitespace(v);
  return s || null;
}

function normalizeStringArray(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map(normalizeWhitespace)
    .filter(Boolean)
    .slice(0, 200);
}

function normalizeNullableInt(v: unknown) {
  if (v == null) return null;
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n <= 0) return null;
  return n;
}

export const SyncMetadataSchema = z.object({
  title: z.string().nullable(),
  authors: z.array(z.string()).max(200),
  language: z.string().nullable(),
  description: z.string().nullable(),
  isbn10: z.string().nullable(),
  isbn13: z.string().nullable(),
  publisher: z.string().nullable(),
  publishDate: z.string().nullable(),
  subjects: z.array(z.string()).max(200),
  // DB-only (kept in snapshot+diff, not merged against EPUB unless present)
  pageCount: z.number().int().positive().nullable(),
  openLibraryId: z.string().nullable(),
});

export type SyncMetadata = z.infer<typeof SyncMetadataSchema>;

export type MergeDecision = "no_change" | "take_epub" | "take_db" | "conflict_take_epub";

export type MergeFieldResult = {
  field: keyof SyncMetadata;
  decision: MergeDecision;
  changed: boolean;
  epubValue: unknown;
  dbValue: unknown;
  snapValue: unknown;
  chosenValue: unknown;
  conflict: boolean;
};

export type ResyncResult =
  | {
      ok: true;
      bookId: string;
      writeback: boolean;
      oldContentHash: string | null;
      newContentHash: string | null;
      fields: MergeFieldResult[];
    }
  | {
      ok: false;
      bookId: string;
      error: string;
    };

function deepEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function threeWayMergeField(args: {
  field: keyof SyncMetadata;
  epubValue: unknown;
  dbValue: unknown;
  snapValue: unknown;
  // If false, the field is treated as DB-only (no EPUB comparison).
  mergeWithEpub: boolean;
}): MergeFieldResult {
  const { field, epubValue, dbValue, snapValue, mergeWithEpub } = args;

  if (!mergeWithEpub) {
    // DB-only: treat as a simple “DB vs snapshot” track; no writeback.
    if (deepEqual(dbValue, snapValue)) {
      return {
        field,
        decision: "no_change",
        changed: false,
        epubValue,
        dbValue,
        snapValue,
        chosenValue: dbValue,
        conflict: false,
      };
    }

    return {
      field,
      decision: "take_db",
      changed: true,
      epubValue,
      dbValue,
      snapValue,
      chosenValue: dbValue,
      conflict: false,
    };
  }

  const epubEqSnap = deepEqual(epubValue, snapValue);
  const dbEqSnap = deepEqual(dbValue, snapValue);

  if (epubEqSnap && dbEqSnap) {
    return {
      field,
      decision: "no_change",
      changed: false,
      epubValue,
      dbValue,
      snapValue,
      chosenValue: dbValue,
      conflict: false,
    };
  }

  if (!epubEqSnap && dbEqSnap) {
    return {
      field,
      decision: "take_epub",
      changed: true,
      epubValue,
      dbValue,
      snapValue,
      chosenValue: epubValue,
      conflict: false,
    };
  }

  if (!dbEqSnap && epubEqSnap) {
    return {
      field,
      decision: "take_db",
      changed: true,
      epubValue,
      dbValue,
      snapValue,
      chosenValue: dbValue,
      conflict: false,
    };
  }

  return {
    field,
    decision: "conflict_take_epub",
    changed: true,
    epubValue,
    dbValue,
    snapValue,
    chosenValue: epubValue,
    conflict: true,
  };
}

export function extractSyncMetadataFromDb(book: {
  title: string;
  authors: unknown;
  language: string | null;
  description: string | null;
  isbn10: string | null;
  isbn13: string | null;
  publisher: string | null;
  publishDate: string | null;
  subjects: unknown;
  pageCount: number | null;
  openLibraryId: string | null;
}): SyncMetadata {
  return {
    title: normalizeNullableString(book.title) ?? null,
    authors: normalizeStringArray(book.authors),
    language: normalizeNullableString(book.language),
    description: normalizeNullableString(book.description),
    isbn10: normalizeNullableString(book.isbn10),
    isbn13: normalizeNullableString(book.isbn13),
    publisher: normalizeNullableString(book.publisher),
    publishDate: normalizeNullableString(book.publishDate),
    subjects: normalizeStringArray(book.subjects),
    pageCount: normalizeNullableInt(book.pageCount),
    openLibraryId: normalizeNullableString(book.openLibraryId),
  };
}

export async function extractSyncMetadataFromEpub(epubBytes: Buffer): Promise<SyncMetadata> {
  const raw = await extractEpubMetadata(epubBytes);
  return extractSyncMetadataFromEpubRaw(raw);
}

function extractSyncMetadataFromEpubRaw(raw: EpubMetadata): SyncMetadata {
  // Note: `extractEpubMetadata` extracts a stable subset. Extended fields are filled
  // with null/empty to avoid false conflicts on DB-only fields.
  return {
    title: raw.title ? normalizeWhitespace(raw.title) : null,
    authors: raw.authors.map(normalizeWhitespace).filter(Boolean),
    language: raw.language ? normalizeWhitespace(raw.language) : null,
    description: raw.description ? normalizeWhitespace(raw.description) : null,
    isbn10: raw.isbn10 ? normalizeWhitespace(raw.isbn10) : null,
    isbn13: raw.isbn13 ? normalizeWhitespace(raw.isbn13) : null,
    publisher: null,
    publishDate: null,
    subjects: [],
    pageCount: null,
    openLibraryId: null,
  };
}

function normalizeSnapshot(v: unknown): SyncMetadata {
  const parsed = SyncMetadataSchema.safeParse(v);
  if (parsed.success) return parsed.data;

  const o = (v ?? {}) as Record<string, unknown>;
  return SyncMetadataSchema.parse({
    title: normalizeNullableString(o.title),
    authors: normalizeStringArray(o.authors),
    language: normalizeNullableString(o.language),
    description: normalizeNullableString(o.description),
    isbn10: normalizeNullableString(o.isbn10),
    isbn13: normalizeNullableString(o.isbn13),
    publisher: normalizeNullableString(o.publisher),
    publishDate: normalizeNullableString(o.publishDate),
    subjects: normalizeStringArray(o.subjects),
    pageCount: normalizeNullableInt(o.pageCount),
    openLibraryId: normalizeNullableString(o.openLibraryId),
  });
}

export function threeWayMergeAllFields(args: {
  epub: SyncMetadata;
  db: SyncMetadata;
  snapshot: SyncMetadata;
}): { mergedDb: SyncMetadata; fields: MergeFieldResult[]; requiresWriteback: boolean } {
  const { epub, db, snapshot } = args;

  const fieldsConfig = [
    { field: "title", mergeWithEpub: true },
    { field: "authors", mergeWithEpub: true },
    { field: "language", mergeWithEpub: true },
    { field: "description", mergeWithEpub: true },
    { field: "isbn10", mergeWithEpub: true },
    { field: "isbn13", mergeWithEpub: true },
    { field: "publisher", mergeWithEpub: true },
    { field: "publishDate", mergeWithEpub: true },
    { field: "subjects", mergeWithEpub: true },
    // DB-only in V1 (kept for snapshot+diff; not compared to EPUB)
    { field: "pageCount", mergeWithEpub: false },
    { field: "openLibraryId", mergeWithEpub: false },
  ] as const;

  const fieldResults = fieldsConfig.map(({ field, mergeWithEpub }) =>
    threeWayMergeField({
      field,
      epubValue: epub[field],
      dbValue: db[field],
      snapValue: snapshot[field],
      mergeWithEpub,
    }),
  );

  const mergedDb = { ...db } as SyncMetadata;
  for (const r of fieldResults) {
    if (r.decision === "take_epub" || r.decision === "conflict_take_epub") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mergedDb as any)[r.field] = r.chosenValue;
    }
  }

  const requiresWriteback = fieldResults.some(
    (r) => r.decision === "take_db" && r.field !== "pageCount" && r.field !== "openLibraryId",
  );

  return { mergedDb, fields: fieldResults, requiresWriteback };
}

export async function resyncBookMetadata(bookId: string): Promise<ResyncResult> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, deletedAt: null },
    select: {
      id: true,
      contentHash: true,
      title: true,
      authors: true,
      language: true,
      description: true,
      isbn10: true,
      isbn13: true,
      publisher: true,
      publishDate: true,
      subjects: true,
      pageCount: true,
      openLibraryId: true,
      format: true,
      files: {
        select: { id: true, storagePath: true, filename: true, mimeType: true, contentHash: true },
        take: 1,
      },
      snapshot: {
        select: { id: true, epubMetadata: true, dbMetadata: true },
      },
    },
  });

  if (!book) return { ok: false, bookId, error: "Not found" };
  if (book.format !== "epub") return { ok: false, bookId, error: "Not an EPUB" };

  const file = book.files[0];
  if (!file) return { ok: false, bookId, error: "File missing" };
  if (!book.snapshot) return { ok: false, bookId, error: "Snapshot missing" };
  const snapshot = book.snapshot;

  const adapter = getStorageAdapter();
  const maxBytes = getMaxEpubBytesForSync();

  const epubBytes = await adapter.download(file.storagePath);
  if (epubBytes.byteLength <= 0 || epubBytes.byteLength > maxBytes) {
    return { ok: false, bookId, error: `File too large (max ${maxBytes} bytes)` };
  }

  const dbMeta = extractSyncMetadataFromDb(book);
  const epubRaw = await extractEpubMetadata(epubBytes);
  const epubMeta = extractSyncMetadataFromEpubRaw(epubRaw);
  const snapMeta = normalizeSnapshot(snapshot.dbMetadata);

  const merge = threeWayMergeAllFields({ epub: epubMeta, db: dbMeta, snapshot: snapMeta });

  // If DB wins for at least one mergeable field, we must write back to the EPUB.
  if (merge.requiresWriteback) {
    const updatedEpubBytes = await writeEpubOpfMetadata(epubBytes, {
      title: merge.mergedDb.title,
      authors: merge.mergedDb.authors,
      language: merge.mergedDb.language,
      description: merge.mergedDb.description,
      isbn10: merge.mergedDb.isbn10,
      isbn13: merge.mergedDb.isbn13,
      publisher: merge.mergedDb.publisher,
      publishDate: merge.mergedDb.publishDate,
      subjects: merge.mergedDb.subjects,
    });
    const epubRawAfter = await extractEpubMetadata(updatedEpubBytes);

    const newHash = sha256Hex(updatedEpubBytes);

    const collision = await prisma.book.findFirst({
      where: { id: { not: bookId }, deletedAt: null, contentHash: newHash },
      select: { id: true },
    });
    if (collision) {
      return {
        ok: false,
        bookId,
        error: "Writeback would create a duplicate (content hash collision).",
      };
    }

    const newStoragePath = buildBookFileStoragePath({
      format: "epub",
      author: merge.mergedDb.authors[0] ?? "unknown",
      filename: file.filename,
    });

    await adapter.upload(updatedEpubBytes, newStoragePath);
    if (newStoragePath !== file.storagePath) {
      await adapter.delete(file.storagePath).catch(() => undefined);
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: bookId },
        data: {
          title: merge.mergedDb.title ?? book.title,
          authors: merge.mergedDb.authors,
          language: merge.mergedDb.language,
          description: merge.mergedDb.description,
          isbn10: merge.mergedDb.isbn10,
          isbn13: merge.mergedDb.isbn13,
          publisher: merge.mergedDb.publisher,
          publishDate: merge.mergedDb.publishDate,
          subjects: merge.mergedDb.subjects,
          pageCount: merge.mergedDb.pageCount,
          openLibraryId: merge.mergedDb.openLibraryId,
          contentHash: newHash,
          updatedAt: now,
        },
      });

      await tx.bookFile.update({
        where: { id: file.id },
        data: {
          storagePath: newStoragePath,
          fileSize: BigInt(updatedEpubBytes.byteLength),
          contentHash: newHash,
        },
      });

      await tx.bookMetadataSnapshot.update({
        where: { id: snapshot.id },
        data: {
          epubMetadata: epubRawAfter,
          dbMetadata: merge.mergedDb,
          syncedAt: now,
        },
      });
    });

    await updateBookSearchVector(bookId);

    return {
      ok: true,
      bookId,
      writeback: true,
      oldContentHash: book.contentHash,
      newContentHash: newHash,
      fields: merge.fields,
    };
  }

  // No writeback: EPUB wins (or no changes). Update DB + snapshot if needed.
  const anyDbUpdate = merge.fields.some(
    (r) =>
      r.decision === "take_epub" ||
      r.decision === "conflict_take_epub" ||
      (r.decision === "take_db" && (r.field === "pageCount" || r.field === "openLibraryId")),
  );

  if (!anyDbUpdate) {
    return {
      ok: true,
      bookId,
      writeback: false,
      oldContentHash: book.contentHash,
      newContentHash: book.contentHash,
      fields: merge.fields,
    };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.book.update({
      where: { id: bookId },
      data: {
        title: merge.mergedDb.title ?? book.title,
        authors: merge.mergedDb.authors,
        language: merge.mergedDb.language,
        description: merge.mergedDb.description,
        isbn10: merge.mergedDb.isbn10,
        isbn13: merge.mergedDb.isbn13,
        publisher: merge.mergedDb.publisher,
        publishDate: merge.mergedDb.publishDate,
        subjects: merge.mergedDb.subjects,
        pageCount: merge.mergedDb.pageCount,
        openLibraryId: merge.mergedDb.openLibraryId,
        updatedAt: now,
      },
    });

    await tx.bookMetadataSnapshot.update({
      where: { id: snapshot.id },
      data: {
        epubMetadata: epubRaw,
        dbMetadata: merge.mergedDb,
        syncedAt: now,
      },
    });
  });

  await updateBookSearchVector(bookId);

  return {
    ok: true,
    bookId,
    writeback: false,
    oldContentHash: book.contentHash,
    newContentHash: book.contentHash,
    fields: merge.fields,
  };
}
