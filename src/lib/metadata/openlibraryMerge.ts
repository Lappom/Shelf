import type { OpenLibraryEnrichment } from "@/lib/metadata/openlibrary";

export type BookMetadataForMerge = {
  title: string | null;
  authors: string[];
  language: string | null;
  description: string | null;
  isbn10: string | null;
  isbn13: string | null;
  publisher: string | null;
  publishDate: string | null;
  subjects: string[];
  pageCount: number | null;
  openLibraryId: string | null;
  coverUrl: string | null;
};

export function mergeOpenLibraryIntoBookMetadata(args: {
  base: BookMetadataForMerge;
  enrichment: OpenLibraryEnrichment;
  mode: "complement_only";
}): BookMetadataForMerge {
  const { base, enrichment } = args;

  const subjects =
    Array.isArray(base.subjects) && base.subjects.length
      ? base.subjects
      : (enrichment.subjects ?? []);

  const description = base.description ?? enrichment.description ?? null;
  const pageCount = base.pageCount ?? enrichment.pageCount ?? null;
  const publisher = base.publisher ?? enrichment.publisher ?? null;
  const language = base.language ?? enrichment.language ?? null;

  return {
    ...base,
    openLibraryId: base.openLibraryId ?? enrichment.openLibraryId ?? null,
    description,
    subjects,
    pageCount,
    publisher,
    language,
    // coverUrl handled separately; never point DB to a remote Open Library URL.
  };
}
