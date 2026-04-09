"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import {
  enrichFromOpenLibraryByIsbn,
  searchOpenLibraryByTitleAuthor,
} from "@/lib/metadata/openlibrary";
import { mergeOpenLibraryIntoBookMetadata } from "@/lib/metadata/openlibraryMerge";
import { fetchOpenLibraryCoverByIsbn } from "@/lib/metadata/openlibraryCover";
import { getStorageAdapter } from "@/lib/storage";
import { buildCoverStoragePath } from "@/lib/storage/paths";
import { updateBookSearchVector } from "@/lib/search/searchVector";

const SearchSchema = z.object({
  bookId: z.string().uuid(),
});

const PreviewSchema = z.object({
  isbn: z.string().min(1),
});

const ApplySchema = z.object({
  bookId: z.string().uuid(),
  isbn: z.string().min(1),
  // If true, we will fetch & store the Open Library cover when book has no coverUrl.
  applyCoverIfMissing: z.boolean().optional(),
  // If true, ignore existing cover and refresh it (admin-only).
  forceCover: z.boolean().optional(),
});

function normalizeIsbn(raw: string) {
  const s = raw.trim();
  const compact = s.replace(/[\s-]+/g, "").toUpperCase();
  if (/^[0-9]{10}$/.test(compact)) return compact;
  if (/^[0-9]{9}X$/.test(compact)) return compact;
  if (/^[0-9]{13}$/.test(compact)) return compact;
  return null;
}

export type OpenLibraryCandidate = {
  key: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  isbns: string[];
};

export async function openLibrarySearchForBookAction(args: z.infer<typeof SearchSchema>): Promise<
  | {
      ok: true;
      candidates: OpenLibraryCandidate[];
    }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const parsed = SearchSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: "Invalid payload" };

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.bookId, deletedAt: null },
    select: { id: true, title: true, authors: true },
  });
  if (!book) return { ok: false, error: "Not found" };

  const title = (book.title ?? "").trim();
  const authors = Array.isArray(book.authors) ? book.authors : [];
  const author = String(authors[0] ?? "").trim();
  if (!title || !author) return { ok: true, candidates: [] };

  try {
    await rateLimitOrThrow({
      key: `openlibrary:search_for_book:${book.id}`,
      limit: 20,
      windowMs: 60_000,
    });
  } catch {
    return { ok: false, error: "Too many requests" };
  }

  try {
    const candidates = await searchOpenLibraryByTitleAuthor({ title, author, limit: 10 });
    return { ok: true, candidates };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OpenLibrary error" };
  }
}

export async function openLibraryPreviewIsbnAction(
  args: z.infer<typeof PreviewSchema>,
): Promise<
  | { ok: true; enrichment: Awaited<ReturnType<typeof enrichFromOpenLibraryByIsbn>> }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const parsed = PreviewSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: "Invalid payload" };

  const isbn = normalizeIsbn(parsed.data.isbn);
  if (!isbn) return { ok: false, error: "Invalid ISBN" };

  try {
    await rateLimitOrThrow({
      key: `openlibrary:preview_isbn:${isbn}`,
      limit: 40,
      windowMs: 60_000,
    });
  } catch {
    return { ok: false, error: "Too many requests" };
  }

  try {
    const enrichment = await enrichFromOpenLibraryByIsbn(isbn);
    return { ok: true, enrichment };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OpenLibrary error" };
  }
}

export async function openLibraryApplyEnrichmentAction(
  args: z.infer<typeof ApplySchema>,
): Promise<{ ok: true; bookId: string; coverUpdated: boolean } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = ApplySchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: "Invalid payload" };

  const isbn = normalizeIsbn(parsed.data.isbn);
  if (!isbn) return { ok: false, error: "Invalid ISBN" };

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.bookId, deletedAt: null },
    select: {
      id: true,
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
      coverUrl: true,
    },
  });
  if (!book) return { ok: false, error: "Not found" };

  try {
    await rateLimitOrThrow({ key: `openlibrary:apply:${book.id}`, limit: 20, windowMs: 60_000 });
  } catch {
    return { ok: false, error: "Too many requests" };
  }

  const enrichment = await enrichFromOpenLibraryByIsbn(isbn).catch(() => null);
  if (!enrichment) return { ok: false, error: "OpenLibrary error" };

  const merged = mergeOpenLibraryIntoBookMetadata({
    base: {
      title: book.title ?? null,
      authors: Array.isArray(book.authors) ? (book.authors as string[]) : [],
      language: book.language ?? null,
      description: book.description ?? null,
      isbn10: book.isbn10 ?? null,
      isbn13: book.isbn13 ?? null,
      publisher: book.publisher ?? null,
      publishDate: book.publishDate ?? null,
      subjects: Array.isArray(book.subjects) ? (book.subjects as string[]) : [],
      pageCount: book.pageCount ?? null,
      openLibraryId: book.openLibraryId ?? null,
      coverUrl: book.coverUrl ?? null,
    },
    enrichment,
    mode: "complement_only",
  });

  // Never overwrite existing ISBNs automatically; only fill if missing.
  const isbn10 = merged.isbn10 ?? (isbn.length === 10 ? isbn : null);
  const isbn13 = merged.isbn13 ?? (isbn.length === 13 ? isbn : null);

  const shouldFetchCover =
    Boolean(parsed.data.forceCover) || (Boolean(parsed.data.applyCoverIfMissing) && !book.coverUrl);

  let coverUpdated = false;
  if (shouldFetchCover) {
    const cover = await fetchOpenLibraryCoverByIsbn(isbn);
    if (cover.ok) {
      const adapter = getStorageAdapter();
      const path = buildCoverStoragePath({ bookId: book.id, ext: cover.ext });
      await adapter.upload(cover.bytes, path);
      await prisma.book.update({
        where: { id: book.id },
        data: { coverUrl: path },
        select: { id: true },
      });
      coverUpdated = true;
    }
  }

  await prisma.book.update({
    where: { id: book.id },
    data: {
      description: merged.description,
      subjects: merged.subjects,
      pageCount: merged.pageCount,
      openLibraryId: merged.openLibraryId,
      isbn10,
      isbn13,
      metadataSource: "openlibrary" as never,
    },
    select: { id: true },
  });

  await updateBookSearchVector(book.id);

  return { ok: true, bookId: book.id, coverUpdated };
}
