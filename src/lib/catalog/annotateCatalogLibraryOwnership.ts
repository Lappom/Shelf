import type { Prisma } from "@prisma/client";

import { normalizeIsbn } from "@/lib/books/isbn";
import { prisma } from "@/lib/db/prisma";

import type { CatalogSearchCandidate } from "./searchCatalogPreview";

export type CatalogCandidateWithLibrary = CatalogSearchCandidate & {
  inLibrary: boolean;
  libraryBookId: string | null;
};

/**
 * Marks catalog candidates already owned by the user (same external id or ISBN-13).
 */
export async function annotateCatalogCandidatesLibraryOwnership(
  userId: string,
  candidates: CatalogSearchCandidate[],
): Promise<CatalogCandidateWithLibrary[]> {
  if (candidates.length === 0) return [];

  const isbn13s = new Set<string>();
  for (const c of candidates) {
    for (const raw of c.isbns) {
      const n = normalizeIsbn(raw);
      if (n && n.length === 13) isbn13s.add(n);
    }
  }

  const orClause: Prisma.BookWhereInput[] = candidates.map((c) => ({
    externalCatalogProvider: c.provider,
    externalCatalogId: c.providerId,
  }));
  if (isbn13s.size > 0) {
    orClause.push({ isbn13: { in: [...isbn13s] } });
  }

  const books = await prisma.book.findMany({
    where: {
      deletedAt: null,
      addedById: userId,
      OR: orClause,
    },
    select: {
      id: true,
      isbn13: true,
      externalCatalogProvider: true,
      externalCatalogId: true,
    },
  });

  const byProviderKey = new Map<string, string>();
  const byIsbn = new Map<string, string>();
  for (const b of books) {
    if (b.externalCatalogProvider && b.externalCatalogId) {
      byProviderKey.set(`${b.externalCatalogProvider}:${b.externalCatalogId}`, b.id);
    }
    if (b.isbn13) byIsbn.set(b.isbn13, b.id);
  }

  return candidates.map((c) => {
    const pk = `${c.provider}:${c.providerId}`;
    let libraryBookId = byProviderKey.get(pk) ?? null;
    if (!libraryBookId) {
      for (const raw of c.isbns) {
        const n = normalizeIsbn(raw);
        if (n && n.length === 13) {
          const bid = byIsbn.get(n);
          if (bid) {
            libraryBookId = bid;
            break;
          }
        }
      }
    }
    return {
      ...c,
      inLibrary: libraryBookId != null,
      libraryBookId,
    };
  });
}
