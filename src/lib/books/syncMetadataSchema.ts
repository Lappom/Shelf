import { z } from "zod";

/** Canonical shape for EPUB ↔ DB ↔ snapshot metadata merge. */
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
  // DB-only in V1 (kept in snapshot+diff; not merged against EPUB unless present)
  pageCount: z.number().int().positive().nullable(),
  openLibraryId: z.string().nullable(),
});

export type SyncMetadata = z.infer<typeof SyncMetadataSchema>;

export const SYNC_METADATA_FIELD_KEYS = [
  "title",
  "authors",
  "language",
  "description",
  "isbn10",
  "isbn13",
  "publisher",
  "publishDate",
  "subjects",
  "pageCount",
  "openLibraryId",
] as const satisfies readonly (keyof SyncMetadata)[];

export type SyncMetadataFieldKey = (typeof SYNC_METADATA_FIELD_KEYS)[number];
