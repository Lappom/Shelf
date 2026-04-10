import { extractEpubMetadata, type EpubMetadata } from "@/lib/epub";

import { logAdminAudit } from "@/lib/admin/auditLog";
import { isbn13CompatibleWithIsbn10 } from "@/lib/books/isbnConvert";
import { normalizeSyncMetadata } from "@/lib/books/metadataNormalize";
import {
  applyResolvedSyncMetadata,
  extractSyncMetadataFromDb,
  extractSyncMetadataFromEpubRaw,
  normalizeSnapshotDbMetadata,
} from "@/lib/books/metadataSync";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter } from "@/lib/storage";
import {
  threeWayMergeAllFields,
  type MergeDecision,
  type MergeFieldResult,
} from "@/lib/books/metadataThreeWayMerge";
import type { SyncMetadata } from "@/lib/books/syncMetadataSchema";
import { SYNC_METADATA_FIELD_KEYS } from "@/lib/books/syncMetadataSchema";

export type BusinessConflictCode =
  | "isbn_mismatch"
  | "invalid_language"
  | "missing_title_with_identifier"
  | "ambiguous_publish_date";

export type FieldMergeAnalysis = {
  field: keyof SyncMetadata;
  mergeWithEpub: boolean;
  epubRaw: unknown;
  dbRaw: unknown;
  snapRaw: unknown;
  epubNormalized: unknown;
  dbNormalized: unknown;
  snapNormalized: unknown;
  automaticDecision: MergeDecision;
  technicalConflict: boolean;
  businessConflicts: BusinessConflictCode[];
  confidence: number;
  chosenByAutomatic: unknown;
};

const OPF_FIELDS = new Set<keyof SyncMetadata>([
  "title",
  "authors",
  "language",
  "description",
  "isbn10",
  "isbn13",
  "publisher",
  "publishDate",
  "subjects",
]);

function deepEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when merged OPF-facing fields differ from current EPUB extraction → OPF writeback needed. */
export function mergedRequiresWriteback(mergedDb: SyncMetadata, epubNorm: SyncMetadata): boolean {
  for (const k of OPF_FIELDS) {
    if (!deepEqual(mergedDb[k], epubNorm[k])) return true;
  }
  return false;
}

function languageLooksInvalid(lang: string | null): boolean {
  if (!lang) return false;
  return !/^[a-z]{2,3}(-[a-z]{2})?$/.test(lang);
}

function publishDateAmbiguous(date: string | null): boolean {
  if (!date) return false;
  if (/^\d{4}$/.test(date)) return false;
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(date)) return false;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(date)) return true;
  return date.length > 40;
}

function collectBusinessConflictsForField(
  field: keyof SyncMetadata,
  merged: Pick<SyncMetadata, "isbn10" | "isbn13" | "language" | "publishDate" | "title">,
): BusinessConflictCode[] {
  const codes: BusinessConflictCode[] = [];
  if (field === "isbn10" || field === "isbn13") {
    const a = merged.isbn10;
    const b = merged.isbn13;
    if (a && b && !isbn13CompatibleWithIsbn10(b, a)) codes.push("isbn_mismatch");
  }
  if (field === "language" && languageLooksInvalid(merged.language)) {
    codes.push("invalid_language");
  }
  if (field === "publishDate" && publishDateAmbiguous(merged.publishDate)) {
    codes.push("ambiguous_publish_date");
  }
  if (field === "title") {
    const hasId = Boolean(merged.isbn10 ?? merged.isbn13);
    if (hasId && !merged.title) codes.push("missing_title_with_identifier");
  }
  return codes;
}

function confidenceForField(
  r: MergeFieldResult,
  businessConflicts: BusinessConflictCode[],
  tripleAgree: boolean,
): number {
  let c = 0.55;
  if (tripleAgree) c = 0.96;
  else if (r.decision === "no_change") c = 0.94;
  else if (!r.conflict && (r.decision === "take_epub" || r.decision === "take_db")) c = 0.78;
  else if (r.decision === "conflict_take_epub") c = 0.42;
  c -= businessConflicts.length * 0.18;
  return Math.max(0, Math.min(1, Math.round(c * 100) / 100));
}

/**
 * Per-field analysis: normalized triple, automatic three-way outcome, business conflicts, confidence.
 */
export function analyzeMetadataMerge(args: {
  epubNorm: SyncMetadata;
  dbNorm: SyncMetadata;
  snapNorm: SyncMetadata;
}): { fields: FieldMergeAnalysis[]; automaticMerged: SyncMetadata; requiresWriteback: boolean } {
  const { epubNorm, dbNorm, snapNorm } = args;
  const { mergedDb, fields, requiresWriteback } = threeWayMergeAllFields({
    epub: epubNorm,
    db: dbNorm,
    snapshot: snapNorm,
  });

  const fieldsConfig = [
    { field: "title" as const, mergeWithEpub: true },
    { field: "authors" as const, mergeWithEpub: true },
    { field: "language" as const, mergeWithEpub: true },
    { field: "description" as const, mergeWithEpub: true },
    { field: "isbn10" as const, mergeWithEpub: true },
    { field: "isbn13" as const, mergeWithEpub: true },
    { field: "publisher" as const, mergeWithEpub: true },
    { field: "publishDate" as const, mergeWithEpub: true },
    { field: "subjects" as const, mergeWithEpub: true },
    { field: "pageCount" as const, mergeWithEpub: false },
    { field: "openLibraryId" as const, mergeWithEpub: false },
  ];

  const mergedProbe: Pick<SyncMetadata, "isbn10" | "isbn13" | "language" | "publishDate" | "title"> =
    {
      isbn10: mergedDb.isbn10,
      isbn13: mergedDb.isbn13,
      language: mergedDb.language,
      publishDate: mergedDb.publishDate,
      title: mergedDb.title,
    };

  const analyses: FieldMergeAnalysis[] = fieldsConfig.map(({ field, mergeWithEpub }) => {
    const r = fields.find((x) => x.field === field)!;
    const en = epubNorm[field];
    const dn = dbNorm[field];
    const sn = snapNorm[field];
    const tripleAgree = deepEqual(en, dn) && deepEqual(dn, sn);
    const businessConflicts = collectBusinessConflictsForField(field, mergedProbe);
    const confidence = confidenceForField(r, businessConflicts, tripleAgree);
    return {
      field,
      mergeWithEpub,
      epubRaw: en,
      dbRaw: dn,
      snapRaw: sn,
      epubNormalized: en,
      dbNormalized: dn,
      snapNormalized: sn,
      automaticDecision: r.decision,
      technicalConflict: r.conflict,
      businessConflicts,
      confidence,
      chosenByAutomatic: r.chosenValue,
    };
  });

  return { fields: analyses, automaticMerged: mergedDb, requiresWriteback };
}

export type FieldDecisionMode = "use_source" | "use_db" | "use_snapshot" | "manual";

export type PerFieldDecision = {
  field: keyof SyncMetadata;
  mode: FieldDecisionMode;
  manual?: unknown;
};

const fieldDecisionSchemaFields: Record<keyof SyncMetadata, true> = {
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
};

export function parsePerFieldDecisions(raw: unknown): PerFieldDecision[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PerFieldDecision[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const o = row as Record<string, unknown>;
    const field = o.field;
    const mode = o.mode;
    if (typeof field !== "string" || !(field in fieldDecisionSchemaFields)) return null;
    if (
      mode !== "use_source" &&
      mode !== "use_db" &&
      mode !== "use_snapshot" &&
      mode !== "manual"
    ) {
      return null;
    }
    out.push({
      field: field as keyof SyncMetadata,
      mode,
      manual: mode === "manual" ? o.manual : undefined,
    });
  }
  return out;
}

/**
 * Build merged metadata from explicit per-field decisions (preview or commit).
 */
export function buildMergedFromDecisions(args: {
  decisions: PerFieldDecision[];
  epubNorm: SyncMetadata;
  dbNorm: SyncMetadata;
  snapNorm: SyncMetadata;
}): { merged: SyncMetadata; error?: string } {
  const { decisions, epubNorm, dbNorm, snapNorm } = args;
  const merged: SyncMetadata = { ...dbNorm };

  const byField = new Map(decisions.map((d) => [d.field, d]));

  for (const key of SYNC_METADATA_FIELD_KEYS) {
    const d = byField.get(key);
    if (!d) continue;
    if (d.mode === "use_source") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = epubNorm[key];
    } else if (d.mode === "use_db") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = dbNorm[key];
    } else if (d.mode === "use_snapshot") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = snapNorm[key];
    } else {
      const parsed = safeParseManualField(key, d.manual);
      if (!parsed.ok) return { merged, error: parsed.error };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = parsed.value;
    }
  }

  try {
    return { merged: normalizeSyncMetadata(merged) };
  } catch {
    return { merged, error: "Invalid merged metadata after normalization" };
  }
}

function safeParseManualField(
  field: keyof SyncMetadata,
  manual: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (manual === undefined) return { ok: false, error: `Missing manual value for ${String(field)}` };

  switch (field) {
    case "title":
    case "language":
    case "description":
    case "isbn10":
    case "isbn13":
    case "publisher":
    case "publishDate":
    case "openLibraryId": {
      if (manual !== null && typeof manual !== "string")
        return { ok: false, error: `${String(field)} must be string or null` };
      return { ok: true, value: manual };
    }
    case "authors":
    case "subjects": {
      if (!Array.isArray(manual) || !manual.every((x) => typeof x === "string")) {
        return { ok: false, error: `${String(field)} must be string[]` };
      }
      return { ok: true, value: manual };
    }
    case "pageCount": {
      if (manual !== null && (typeof manual !== "number" || !Number.isFinite(manual))) {
        return { ok: false, error: "pageCount must be number or null" };
      }
      return { ok: true, value: manual };
    }
    default:
      return { ok: false, error: "Unknown field" };
  }
}

export type MetadataMergeContext = {
  bookId: string;
  bookTitle: string;
  contentHash: string | null;
  snapshotId: string;
  snapshotSyncedAt: string;
  epubNorm: SyncMetadata;
  dbNorm: SyncMetadata;
  snapNorm: SyncMetadata;
  epubRaw: EpubMetadata;
};

export type MetadataMergeFileRow = {
  id: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  contentHash: string;
};

const MAX_BYTES_DEFAULT = 100 * 1024 * 1024;

function getMaxEpubBytesForMerge() {
  const raw = process.env.UPLOAD_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return MAX_BYTES_DEFAULT;
}

export async function loadMetadataMergeBookContext(bookId: string): Promise<
  | { ok: true; ctx: MetadataMergeContext; file: MetadataMergeFileRow }
  | { ok: false; error: string }
> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, deletedAt: null },
    select: {
      id: true,
      title: true,
      contentHash: true,
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
        select: { id: true, dbMetadata: true, syncedAt: true },
      },
    },
  });

  if (!book) return { ok: false, error: "Not found" };
  if (book.format !== "epub") return { ok: false, error: "Not an EPUB" };
  const file = book.files[0];
  if (!file) return { ok: false, error: "File missing" };
  if (!book.snapshot) return { ok: false, error: "Snapshot missing" };

  const adapter = getStorageAdapter();
  const maxBytes = getMaxEpubBytesForMerge();
  const epubBytes = await adapter.download(file.storagePath);
  if (epubBytes.byteLength <= 0 || epubBytes.byteLength > maxBytes) {
    return { ok: false, error: `File too large (max ${maxBytes} bytes)` };
  }

  const epubRaw = await extractEpubMetadata(epubBytes);
  const dbNorm = extractSyncMetadataFromDb(book);
  const epubNorm = extractSyncMetadataFromEpubRaw(epubRaw);
  const snapNorm = normalizeSnapshotDbMetadata(book.snapshot.dbMetadata);

  return {
    ok: true,
    file,
    ctx: {
      bookId: book.id,
      bookTitle: book.title,
      contentHash: book.contentHash,
      snapshotId: book.snapshot.id,
      snapshotSyncedAt: book.snapshot.syncedAt.toISOString(),
      epubNorm,
      dbNorm,
      snapNorm,
      epubRaw,
    },
  };
}

export type CommitMetadataMergeResult =
  | {
      ok: true;
      writeback: boolean;
      oldContentHash: string | null;
      newContentHash: string | null;
      merged: SyncMetadata;
    }
  | { ok: false; error: string };

/** Non-persisted preview for admin UI validation step. */
export function previewMetadataMerge(args: {
  ctx: MetadataMergeContext;
  decisions: PerFieldDecision[];
}): { ok: true; merged: SyncMetadata; writeback: boolean } | { ok: false; error: string } {
  const built = buildMergedFromDecisions({
    decisions: args.decisions,
    epubNorm: args.ctx.epubNorm,
    dbNorm: args.ctx.dbNorm,
    snapNorm: args.ctx.snapNorm,
  });
  if (built.error) return { ok: false, error: built.error };
  const writeback = mergedRequiresWriteback(built.merged, args.ctx.epubNorm);
  return { ok: true, merged: built.merged, writeback };
}

/**
 * Default per-field modes matching automatic three-way rules (EPUB wins on technical conflict).
 */
export function defaultDecisionsFromAnalysis(fields: FieldMergeAnalysis[]): PerFieldDecision[] {
  return fields.map((f) => {
    let mode: FieldDecisionMode = "use_db";
    if (f.automaticDecision === "take_epub" || f.automaticDecision === "conflict_take_epub") {
      mode = "use_source";
    } else if (f.automaticDecision === "take_db") {
      mode = "use_db";
    } else {
      mode = "use_db";
    }
    return { field: f.field, mode };
  });
}

/**
 * Apply admin metadata decisions, persist book + snapshot (+ optional EPUB writeback), audit.
 */
export async function commitMetadataMerge(args: {
  bookId: string;
  actorId: string;
  decisions: PerFieldDecision[];
  expectedSnapshotSyncedAtIso?: string | null;
}): Promise<CommitMetadataMergeResult> {
  const loaded = await loadMetadataMergeBookContext(args.bookId);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const { ctx, file } = loaded;

  if (
    args.expectedSnapshotSyncedAtIso &&
    args.expectedSnapshotSyncedAtIso !== ctx.snapshotSyncedAt
  ) {
    return { ok: false, error: "Snapshot changed since preview; reload and try again." };
  }

  const built = buildMergedFromDecisions({
    decisions: args.decisions,
    epubNorm: ctx.epubNorm,
    dbNorm: ctx.dbNorm,
    snapNorm: ctx.snapNorm,
  });
  if (built.error) return { ok: false, error: built.error };

  const merged = built.merged;
  const requiresWriteback = mergedRequiresWriteback(merged, ctx.epubNorm);

  const adapter = getStorageAdapter();
  const maxBytes = getMaxEpubBytesForMerge();
  const epubBytes = await adapter.download(file.storagePath);
  if (epubBytes.byteLength <= 0 || epubBytes.byteLength > maxBytes) {
    return { ok: false, error: `File too large (max ${maxBytes} bytes)` };
  }

  const epubRawCurrent = await extractEpubMetadata(epubBytes);

  const applied = await applyResolvedSyncMetadata({
    bookId: args.bookId,
    mergedDb: merged,
    epubRawCurrent,
    epubBytes,
    file,
    snapshotId: ctx.snapshotId,
    bookTitleFallback: ctx.bookTitle,
    oldContentHash: ctx.contentHash,
    requiresWriteback,
    mode: { kind: "admin" },
  });

  if (!applied.ok) return { ok: false, error: applied.error };

  const inputPayload = {
    epubNorm: ctx.epubNorm,
    dbNorm: ctx.dbNorm,
    snapNorm: ctx.snapNorm,
    snapshotSyncedAt: ctx.snapshotSyncedAt,
  };

  await prisma.metadataMergeResolutionAudit.create({
    data: {
      bookId: args.bookId,
      actorId: args.actorId,
      snapshotSyncedAtIso: ctx.snapshotSyncedAt,
      input: inputPayload as Prisma.InputJsonValue,
      fieldDecisions: args.decisions as unknown as Prisma.InputJsonValue,
      result: { merged, writeback: applied.writeback } as Prisma.InputJsonValue,
      writeback: applied.writeback,
      oldContentHash: applied.oldContentHash,
      newContentHash: applied.newContentHash,
    },
  });

  await logAdminAudit({
    action: "metadata_merge_commit",
    actorId: args.actorId,
    meta: {
      bookId: args.bookId,
      writeback: applied.writeback,
      fieldsTouched: args.decisions.length,
    },
  });

  return {
    ok: true,
    writeback: applied.writeback,
    oldContentHash: applied.oldContentHash,
    newContentHash: applied.newContentHash,
    merged,
  };
}
