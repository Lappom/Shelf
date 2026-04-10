import { normalizeIsbn } from "@/lib/books/isbn";
import { fetchCatalogCoverFromUrl } from "@/lib/catalog/fetchCatalogCover";
import type { OpenLibrarySearchCandidate } from "@/lib/metadata/openlibrary";
import {
  buildOpenLibraryCoverUrl,
  buildOpenLibraryCoverUrlByCoverId,
  enrichFromOpenLibraryForSearchCandidate,
  normalizeOpenLibraryDocKey,
  searchOpenLibraryCatalogPaged,
} from "@/lib/metadata/openlibrary";
import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { buildCoverStoragePath } from "@/lib/storage/paths";
import { updateBookSearchVector } from "@/lib/search/searchVector";
import {
  decodePullBooksCursor,
  encodePullBooksCursor,
  type PullBooksCursorPayload,
} from "@/lib/admin/pullBooksCursor";

export type PullBooksItemStatus = "created" | "skipped";

export type PullBooksItem = {
  status: PullBooksItemStatus;
  title: string;
  authors: string[];
  open_library_id: string | null;
  isbn_13: string | null;
};

export type AdminPullBooksResult = {
  created: number;
  skipped: number;
  nextCursor: string | null;
  items: PullBooksItem[];
};

/** Normalize Open Library document key for storage and dedup. */
export function normalizeOpenLibraryId(raw: string): string | null {
  return normalizeOpenLibraryDocKey(raw);
}

function firstIsbn13FromCandidate(c: OpenLibrarySearchCandidate): string | null {
  for (const raw of c.isbns) {
    const n = normalizeIsbn(raw);
    if (n && n.length === 13) return n;
  }
  return null;
}

/** Best-effort Open Library cover image URL for server-side fetch (ISBN or cover id). */
function openLibraryCoverSourceUrl(c: OpenLibrarySearchCandidate): string | null {
  const isbn13 = firstIsbn13FromCandidate(c);
  if (isbn13) return buildOpenLibraryCoverUrl(isbn13);
  for (const raw of c.isbns) {
    const n = normalizeIsbn(raw);
    if (n) return buildOpenLibraryCoverUrl(n);
  }
  if (c.coverI != null) return buildOpenLibraryCoverUrlByCoverId(c.coverI);
  return null;
}

function authorsOverlap(dbAuthors: unknown, expected: string[]): boolean {
  if (expected.length === 0) return true;
  const first = expected[0]?.toLowerCase().trim() ?? "";
  if (!first) return true;
  if (!Array.isArray(dbAuthors)) return false;
  return dbAuthors.some((a) => {
    const s = String(a).toLowerCase().trim();
    return s.length > 0 && (s.includes(first) || first.includes(s));
  });
}

/**
 * Last-resort fuzzy dedup when no Open Library id and no ISBN-13 (per SPECS §9.4).
 */
export async function findDuplicateBookHeuristic(
  candidate: OpenLibrarySearchCandidate,
): Promise<{ id: string } | null> {
  const title = candidate.title.trim();
  if (!title) return null;

  const matches = await prisma.book.findMany({
    where: {
      deletedAt: null,
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true, authors: true },
    take: 25,
  });

  const hit = matches.find((b) => authorsOverlap(b.authors, candidate.authors));
  return hit ? { id: hit.id } : null;
}

export async function findExistingBookForCandidate(
  candidate: OpenLibrarySearchCandidate,
): Promise<{ id: string } | null> {
  const olId = normalizeOpenLibraryId(candidate.key);
  if (olId) {
    const byOl = await prisma.book.findFirst({
      where: { deletedAt: null, openLibraryId: olId },
      select: { id: true },
    });
    if (byOl) return byOl;
  }

  const isbn13 = firstIsbn13FromCandidate(candidate);
  if (isbn13) {
    const byIsbn = await prisma.book.findFirst({
      where: { deletedAt: null, isbn13 },
      select: { id: true },
    });
    if (byIsbn) return byIsbn;
  }

  // Last resort: only when the source provides neither a usable OL id nor ISBN-13 (SPECS §9.4).
  if (!olId && !isbn13) {
    return findDuplicateBookHeuristic(candidate);
  }

  return null;
}

export async function executeAdminPullBooks(args: {
  adminUserId: string;
  query: string;
  limit: number;
  cursor: string | null | undefined;
  dryRun: boolean;
}): Promise<AdminPullBooksResult> {
  let q: string;
  let offset: number;

  if (args.cursor && args.cursor.length > 0) {
    let payload: PullBooksCursorPayload;
    try {
      payload = decodePullBooksCursor(args.cursor);
    } catch {
      throw new Error("INVALID_CURSOR");
    }
    q = payload.q;
    offset = payload.offset;
  } else {
    q = args.query.trim();
    offset = 0;
    if (!q) throw new Error("QUERY_REQUIRED");
  }

  const { candidates, numFound, start } = await searchOpenLibraryCatalogPaged({
    q,
    limit: args.limit,
    offset,
  });

  const items: PullBooksItem[] = [];
  let created = 0;
  let skipped = 0;

  for (const c of candidates) {
    const olStored = normalizeOpenLibraryId(c.key);
    const isbn13 = firstIsbn13FromCandidate(c);
    const existing = await findExistingBookForCandidate(c);

    if (existing) {
      skipped += 1;
      items.push({
        status: "skipped",
        title: c.title,
        authors: c.authors,
        open_library_id: olStored,
        isbn_13: isbn13,
      });
      continue;
    }

    if (args.dryRun) {
      created += 1;
      items.push({
        status: "created",
        title: c.title,
        authors: c.authors,
        open_library_id: olStored,
        isbn_13: isbn13,
      });
      continue;
    }

    const isbnFromSearch = isbn13 ?? normalizeIsbn(c.isbns[0] ?? "") ?? null;
    const publishDate = typeof c.firstPublishYear === "number" ? String(c.firstPublishYear) : null;

    const seed = await enrichFromOpenLibraryForSearchCandidate(c).catch(() => null);
    const isbn10Final =
      (isbnFromSearch && isbnFromSearch.length === 10 ? isbnFromSearch : null) ??
      seed?.isbn10 ??
      null;
    const isbn13Merged =
      (isbnFromSearch && isbnFromSearch.length === 13 ? isbnFromSearch : null) ??
      seed?.isbn13 ??
      null;

    let coverSourceUrl = openLibraryCoverSourceUrl(c);
    const isbnForCover = isbn13Merged ?? isbn10Final;
    if (!coverSourceUrl && isbnForCover) {
      coverSourceUrl = buildOpenLibraryCoverUrl(isbnForCover);
    }

    const openLibraryIdStored =
      (seed?.openLibraryId ? normalizeOpenLibraryId(seed.openLibraryId) : null) ?? olStored;

    const book = await prisma.book.create({
      data: {
        title: c.title.slice(0, 500),
        authors: c.authors,
        isbn10: isbn10Final,
        isbn13: isbn13Merged,
        publisher: seed?.publisher ?? null,
        publishDate,
        language: seed?.language ?? null,
        description: seed?.description ?? null,
        pageCount: seed?.pageCount ?? null,
        subjects: seed?.subjects?.length ? seed.subjects : [],
        coverUrl: null,
        format: "physical",
        contentHash: null,
        openLibraryId: openLibraryIdStored,
        metadataSource: "openlibrary",
        addedById: args.adminUserId,
      },
      select: { id: true },
    });

    if (coverSourceUrl) {
      const fetched = await fetchCatalogCoverFromUrl(coverSourceUrl);
      if (fetched.ok) {
        try {
          const adapter = getStorageAdapter();
          const storagePath = buildCoverStoragePath({ bookId: book.id, ext: fetched.ext });
          await adapter.upload(fetched.bytes, storagePath);
          await prisma.book.update({
            where: { id: book.id },
            data: { coverUrl: storagePath },
            select: { id: true },
          });
        } catch {
          // Keep book without cover if storage fails
        }
      }
    }

    await updateBookSearchVector(book.id);

    created += 1;
    items.push({
      status: "created",
      title: c.title,
      authors: c.authors,
      open_library_id: olStored,
      isbn_13: isbn13Merged,
    });
  }

  const returned = candidates.length;
  const effectiveStart = Number.isFinite(start) ? start : offset;
  const nextOffset = effectiveStart + returned;
  const hasMore = returned > 0 && (numFound > 0 ? nextOffset < numFound : returned >= args.limit);
  const nextCursor = hasMore ? encodePullBooksCursor({ v: 1, q, offset: nextOffset }) : null;

  return { created, skipped, nextCursor, items };
}
