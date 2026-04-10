import type { OpenLibrarySearchCandidate } from "@/lib/metadata/openlibrary";
import {
  buildOpenLibraryCoverUrl,
  searchOpenLibraryCatalogPaged,
} from "@/lib/metadata/openlibrary";
import { normalizeIsbn } from "@/lib/books/isbn";
import { prisma } from "@/lib/db/prisma";
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
  const k = raw.trim();
  if (!k) return null;
  return k.startsWith("/") ? k : `/${k}`;
}

function firstIsbn13FromCandidate(c: OpenLibrarySearchCandidate): string | null {
  for (const raw of c.isbns) {
    const n = normalizeIsbn(raw);
    if (n && n.length === 13) return n;
  }
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

    const isbn = isbn13 ?? normalizeIsbn(c.isbns[0] ?? "") ?? null;
    const isbn10 = isbn && isbn.length === 10 ? isbn : null;
    const isbn13Final = isbn && isbn.length === 13 ? isbn : null;
    const publishDate = typeof c.firstPublishYear === "number" ? String(c.firstPublishYear) : null;
    const coverUrl = isbn13Final ? buildOpenLibraryCoverUrl(isbn13Final) : null;

    const book = await prisma.book.create({
      data: {
        title: c.title.slice(0, 500),
        authors: c.authors,
        isbn10,
        isbn13: isbn13Final,
        publisher: null,
        publishDate,
        language: null,
        description: null,
        pageCount: null,
        subjects: [],
        coverUrl,
        format: "physical",
        contentHash: null,
        openLibraryId: olStored,
        metadataSource: "openlibrary",
        addedById: args.adminUserId,
      },
      select: { id: true },
    });

    await updateBookSearchVector(book.id);

    created += 1;
    items.push({
      status: "created",
      title: c.title,
      authors: c.authors,
      open_library_id: olStored,
      isbn_13: isbn13Final,
    });
  }

  const returned = candidates.length;
  const effectiveStart = Number.isFinite(start) ? start : offset;
  const nextOffset = effectiveStart + returned;
  const hasMore = returned > 0 && (numFound > 0 ? nextOffset < numFound : returned >= args.limit);
  const nextCursor = hasMore ? encodePullBooksCursor({ v: 1, q, offset: nextOffset }) : null;

  return { created, skipped, nextCursor, items };
}
