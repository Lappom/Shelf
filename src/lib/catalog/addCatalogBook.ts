import { normalizeIsbn } from "@/lib/books/isbn";
import { prisma } from "@/lib/db/prisma";
import { updateBookSearchVector } from "@/lib/search/searchVector";

export type AddCatalogBookInput = {
  provider: "openlibrary" | "googlebooks";
  providerId: string;
  title: string;
  authors: string[];
  isbns?: string[];
  publishDate?: string;
  language?: string;
  coverUrl?: string;
  query?: string;
  adminUserId: string;
};

export type AddCatalogBookResult = {
  status: "added" | "already_exists" | "potential_conflict";
  bookId: string;
};

function normalizedAuthorHead(authors: string[]) {
  return (authors[0] ?? "").trim().toLowerCase();
}

function normalizeTitle(raw: string) {
  return raw
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function authorsOverlap(dbAuthors: unknown, expected: string[]): boolean {
  const first = normalizedAuthorHead(expected);
  if (!first) return true;
  if (!Array.isArray(dbAuthors)) return false;
  return dbAuthors.some((author) => {
    const text = String(author).trim().toLowerCase();
    return text.length > 0 && (text.includes(first) || first.includes(text));
  });
}

export async function addBookFromCatalog(
  input: AddCatalogBookInput,
): Promise<AddCatalogBookResult> {
  const providerId = input.providerId.trim();
  if (!providerId) throw new Error("INVALID_PROVIDER_ID");

  const byProvider = await prisma.book.findFirst({
    where: {
      deletedAt: null,
      externalCatalogProvider: input.provider,
      externalCatalogId: providerId,
    },
    select: { id: true },
  });
  if (byProvider) return { status: "already_exists", bookId: byProvider.id };

  const isbn13 = (input.isbns ?? [])
    .map((isbn) => normalizeIsbn(isbn))
    .find((isbn): isbn is string => Boolean(isbn && isbn.length === 13));
  if (isbn13) {
    const byIsbn = await prisma.book.findFirst({
      where: { deletedAt: null, isbn13 },
      select: { id: true },
    });
    if (byIsbn) return { status: "already_exists", bookId: byIsbn.id };
  }

  const title = input.title.trim();
  const fuzzyCandidates = await prisma.book.findMany({
    where: {
      deletedAt: null,
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true, authors: true, title: true },
    take: 25,
  });
  const fuzzyMatch = fuzzyCandidates.find(
    (candidate) =>
      normalizeTitle(candidate.title) === normalizeTitle(title) &&
      authorsOverlap(candidate.authors, input.authors),
  );
  if (fuzzyMatch) return { status: "potential_conflict", bookId: fuzzyMatch.id };

  const created = await prisma.book.create({
    data: {
      title: input.title.trim().slice(0, 500),
      authors: input.authors.slice(0, 50),
      isbn10: null,
      isbn13: isbn13 ?? null,
      publisher: null,
      publishDate: input.publishDate?.trim() || null,
      language: input.language?.trim() || null,
      description: null,
      pageCount: null,
      subjects: [],
      coverUrl: input.coverUrl?.trim() || null,
      format: "physical",
      contentHash: null,
      openLibraryId: input.provider === "openlibrary" ? providerId : null,
      externalCatalogProvider: input.provider,
      externalCatalogId: providerId,
      externalCatalogQuery: input.query?.trim() || null,
      metadataSource: input.provider === "openlibrary" ? "openlibrary" : "manual",
      addedById: input.adminUserId,
    },
    select: { id: true },
  });

  await updateBookSearchVector(created.id);
  return { status: "added", bookId: created.id };
}
