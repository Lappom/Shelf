import { createHash } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { buildBookFileStoragePath } from "@/lib/storage/paths";
import { extractEpubMetadata, writeEpubOpfMetadata, type EpubMetadata } from "@/lib/epub";
import { updateBookSearchVector } from "@/lib/search/searchVector";

import { normalizeSyncMetadata } from "./metadataNormalize";
import { threeWayMergeAllFields, type MergeFieldResult } from "./metadataThreeWayMerge";
import { type SyncMetadata, SyncMetadataSchema } from "./syncMetadataSchema";

export { SyncMetadataSchema, type SyncMetadata } from "./syncMetadataSchema";
export {
  threeWayMergeAllFields,
  type MergeDecision,
  type MergeFieldResult,
} from "./metadataThreeWayMerge";

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

export type ApplyResolvedMetadataMode =
  | { kind: "resync"; mergeFields: MergeFieldResult[] }
  | { kind: "admin" };

export async function applyResolvedSyncMetadata(args: {
  bookId: string;
  mergedDb: SyncMetadata;
  epubRawCurrent: EpubMetadata;
  epubBytes: Buffer;
  file: {
    id: string;
    storagePath: string;
    filename: string;
    mimeType: string;
    contentHash: string;
  };
  snapshotId: string;
  bookTitleFallback: string;
  oldContentHash: string | null;
  requiresWriteback: boolean;
  mode: ApplyResolvedMetadataMode;
}): Promise<
  | { ok: true; writeback: boolean; oldContentHash: string | null; newContentHash: string | null }
  | { ok: false; error: string }
> {
  const {
    bookId,
    mergedDb,
    epubRawCurrent,
    epubBytes,
    file,
    snapshotId,
    bookTitleFallback,
    oldContentHash,
    requiresWriteback,
    mode,
  } = args;

  const adapter = getStorageAdapter();

  if (requiresWriteback) {
    const updatedEpubBytes = await writeEpubOpfMetadata(epubBytes, {
      title: mergedDb.title,
      authors: mergedDb.authors,
      language: mergedDb.language,
      description: mergedDb.description,
      isbn10: mergedDb.isbn10,
      isbn13: mergedDb.isbn13,
      publisher: mergedDb.publisher,
      publishDate: mergedDb.publishDate,
      subjects: mergedDb.subjects,
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
        error: "Writeback would create a duplicate (content hash collision).",
      };
    }

    const newStoragePath = buildBookFileStoragePath({
      format: "epub",
      author: mergedDb.authors[0] ?? "unknown",
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
          title: mergedDb.title ?? bookTitleFallback,
          authors: mergedDb.authors,
          language: mergedDb.language,
          description: mergedDb.description,
          isbn10: mergedDb.isbn10,
          isbn13: mergedDb.isbn13,
          publisher: mergedDb.publisher,
          publishDate: mergedDb.publishDate,
          subjects: mergedDb.subjects,
          pageCount: mergedDb.pageCount,
          openLibraryId: mergedDb.openLibraryId,
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
        where: { id: snapshotId },
        data: {
          epubMetadata: epubRawAfter,
          dbMetadata: mergedDb,
          syncedAt: now,
        },
      });
    });

    await updateBookSearchVector(bookId);

    return {
      ok: true,
      writeback: true,
      oldContentHash,
      newContentHash: newHash,
    };
  }

  const anyDbUpdate =
    mode.kind === "admin"
      ? true
      : mode.mergeFields.some(
          (r) =>
            r.decision === "take_epub" ||
            r.decision === "conflict_take_epub" ||
            (r.decision === "take_db" && (r.field === "pageCount" || r.field === "openLibraryId")),
        );

  if (!anyDbUpdate) {
    return {
      ok: true,
      writeback: false,
      oldContentHash,
      newContentHash: oldContentHash,
    };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.book.update({
      where: { id: bookId },
      data: {
        title: mergedDb.title ?? bookTitleFallback,
        authors: mergedDb.authors,
        language: mergedDb.language,
        description: mergedDb.description,
        isbn10: mergedDb.isbn10,
        isbn13: mergedDb.isbn13,
        publisher: mergedDb.publisher,
        publishDate: mergedDb.publishDate,
        subjects: mergedDb.subjects,
        pageCount: mergedDb.pageCount,
        openLibraryId: mergedDb.openLibraryId,
        updatedAt: now,
      },
    });

    await tx.bookMetadataSnapshot.update({
      where: { id: snapshotId },
      data: {
        epubMetadata: epubRawCurrent,
        dbMetadata: mergedDb,
        syncedAt: now,
      },
    });
  });

  await updateBookSearchVector(bookId);

  return {
    ok: true,
    writeback: false,
    oldContentHash,
    newContentHash: oldContentHash,
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
  const raw: SyncMetadata = {
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
  return normalizeSyncMetadata(raw);
}

export async function extractSyncMetadataFromEpub(epubBytes: Buffer): Promise<SyncMetadata> {
  const raw = await extractEpubMetadata(epubBytes);
  return extractSyncMetadataFromEpubRaw(raw);
}

export function extractSyncMetadataFromEpubRaw(raw: EpubMetadata): SyncMetadata {
  const rawMeta: SyncMetadata = {
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
  return normalizeSyncMetadata(rawMeta);
}

export function normalizeSnapshotDbMetadata(v: unknown): SyncMetadata {
  const parsed = SyncMetadataSchema.safeParse(v);
  if (parsed.success) return normalizeSyncMetadata(parsed.data);

  const o = (v ?? {}) as Record<string, unknown>;
  const raw = SyncMetadataSchema.parse({
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
  return normalizeSyncMetadata(raw);
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
  const snapMeta = normalizeSnapshotDbMetadata(snapshot.dbMetadata);

  const merge = threeWayMergeAllFields({ epub: epubMeta, db: dbMeta, snapshot: snapMeta });

  const applied = await applyResolvedSyncMetadata({
    bookId,
    mergedDb: merge.mergedDb,
    epubRawCurrent: epubRaw,
    epubBytes,
    file,
    snapshotId: snapshot.id,
    bookTitleFallback: book.title,
    oldContentHash: book.contentHash,
    requiresWriteback: merge.requiresWriteback,
    mode: { kind: "resync", mergeFields: merge.fields },
  });

  if (!applied.ok) {
    return { ok: false, bookId, error: applied.error };
  }

  return {
    ok: true,
    bookId,
    writeback: applied.writeback,
    oldContentHash: applied.oldContentHash,
    newContentHash: applied.newContentHash,
    fields: merge.fields,
  };
}
