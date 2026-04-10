import { z } from "zod";

import { normalizeIsbn } from "@/lib/books/isbn";
import { searchGoogleBooksCatalog } from "@/lib/metadata/googlebooks";
import {
  buildOpenLibraryCoverUrl,
  searchOpenLibraryCatalog,
  type OpenLibrarySearchCandidate,
} from "@/lib/metadata/openlibrary";

export const CatalogSearchInputSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional(),
    author: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(10).default(10),
  })
  .superRefine((data, ctx) => {
    const hasQ = Boolean(data.q && data.q.length > 0);
    const hasTitle = Boolean(data.title && data.title.length > 0);
    const hasAuthor = Boolean(data.author && data.author.length > 0);

    if (hasQ === hasTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of q or title",
        path: ["q"],
      });
    }

    if (hasQ && hasAuthor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "author is only allowed with title search",
        path: ["author"],
      });
    }
  });

export type CatalogSearchInput = z.infer<typeof CatalogSearchInputSchema>;

export type CatalogProviderName = "openlibrary" | "googlebooks";

export type CatalogSearchCandidate = {
  provider: CatalogProviderName;
  providerId: string;
  key: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  isbns: string[];
  language: string | null;
  relevanceScore: number;
  coverPreviewUrl: string | null;
};

export type CatalogSearchResult = {
  partial: boolean;
  providers: Record<CatalogProviderName, { ok: boolean }>;
  candidates: CatalogSearchCandidate[];
};

function withCoverPreviewOpenLibrary(c: OpenLibrarySearchCandidate): CatalogSearchCandidate {
  let coverPreviewUrl: string | null = null;
  for (const raw of c.isbns) {
    const n = normalizeIsbn(raw);
    if (!n) continue;
    coverPreviewUrl = buildOpenLibraryCoverUrl(n);
    break;
  }
  return {
    provider: "openlibrary",
    providerId: c.key,
    key: c.key,
    title: c.title,
    authors: c.authors,
    firstPublishYear: c.firstPublishYear,
    isbns: c.isbns,
    language: null,
    relevanceScore: 0,
    coverPreviewUrl,
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function overlapScore(needle: string, haystack: string) {
  const a = new Set(tokenize(needle));
  const b = new Set(tokenize(haystack));
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const token of a) {
    if (b.has(token)) hits += 1;
  }
  return hits / a.size;
}

function computeRelevance(
  candidate: CatalogSearchCandidate,
  input: Pick<CatalogSearchInput, "q" | "title" | "author">,
) {
  const queryTitle = input.title?.trim() ?? input.q?.trim() ?? "";
  const queryAuthor = input.author?.trim() ?? "";
  const titleScore = overlapScore(queryTitle, candidate.title);
  const authorScore = queryAuthor
    ? Math.max(...candidate.authors.map((author) => overlapScore(queryAuthor, author)), 0)
    : 0;
  const isbnHit = candidate.isbns.some((isbn) =>
    tokenize(queryTitle).some((term) => normalizeIsbn(term) === normalizeIsbn(isbn)),
  )
    ? 1
    : 0;
  const languageBonus =
    input.q?.trim() && candidate.language ? overlapScore(input.q, candidate.language) : 0;
  const yearBonus = candidate.firstPublishYear ? Math.min(1, candidate.firstPublishYear / 2100) : 0;
  const score =
    0.45 * titleScore +
    0.25 * authorScore +
    0.2 * isbnHit +
    0.05 * languageBonus +
    0.05 * yearBonus;
  return Number(score.toFixed(6));
}

function dedupeCandidates(candidates: CatalogSearchCandidate[]) {
  const byIsbn = new Map<string, CatalogSearchCandidate>();
  const fuzzy = new Map<string, CatalogSearchCandidate>();

  for (const candidate of candidates) {
    const isbn13 = candidate.isbns
      .map((isbn) => normalizeIsbn(isbn))
      .find((isbn): isbn is string => Boolean(isbn && isbn.length === 13));
    if (isbn13) {
      const previous = byIsbn.get(isbn13);
      if (!previous || candidate.relevanceScore > previous.relevanceScore) {
        byIsbn.set(isbn13, candidate);
      }
      continue;
    }

    const fuzzyKey = `${normalizeText(candidate.title)}::${normalizeText(candidate.authors[0] ?? "")}`;
    const previous = fuzzy.get(fuzzyKey);
    if (!previous || candidate.relevanceScore > previous.relevanceScore) {
      fuzzy.set(fuzzyKey, candidate);
    }
  }

  return [...byIsbn.values(), ...fuzzy.values()];
}

export async function searchCatalogPreview(
  input: CatalogSearchInput,
): Promise<CatalogSearchResult> {
  const q = input.q?.trim();
  const title = input.title?.trim();
  const author = input.author?.trim();
  const normalizedInput = {
    q: q && q.length > 0 ? q : undefined,
    title: title && title.length > 0 ? title : undefined,
    author: author && author.length > 0 ? author : undefined,
  };

  const [openLibraryResult, googleBooksResult] = await Promise.allSettled([
    searchOpenLibraryCatalog({ ...normalizedInput, limit: input.limit }),
    searchGoogleBooksCatalog({ ...normalizedInput, limit: input.limit }),
  ]);

  const providers: CatalogSearchResult["providers"] = {
    openlibrary: { ok: openLibraryResult.status === "fulfilled" },
    googlebooks: { ok: googleBooksResult.status === "fulfilled" },
  };

  const openLibraryCandidates =
    openLibraryResult.status === "fulfilled"
      ? openLibraryResult.value.map(withCoverPreviewOpenLibrary)
      : [];
  const googleBooksCandidates =
    googleBooksResult.status === "fulfilled"
      ? googleBooksResult.value.map((candidate) => ({
          provider: "googlebooks" as const,
          providerId: candidate.providerId,
          key: `googlebooks:${candidate.providerId}`,
          title: candidate.title,
          authors: candidate.authors,
          firstPublishYear: candidate.firstPublishYear,
          isbns: candidate.isbns,
          language: candidate.language,
          relevanceScore: 0,
          coverPreviewUrl: candidate.coverPreviewUrl,
        }))
      : [];

  const merged = [...openLibraryCandidates, ...googleBooksCandidates].map((candidate) => ({
    ...candidate,
    relevanceScore: computeRelevance(candidate, normalizedInput),
  }));
  const deduped = dedupeCandidates(merged);
  deduped.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.providerId.localeCompare(b.providerId);
  });

  if (!providers.openlibrary.ok && !providers.googlebooks.ok) {
    throw new Error("CATALOG_UNAVAILABLE");
  }

  return {
    partial: !providers.openlibrary.ok || !providers.googlebooks.ok,
    providers,
    candidates: deduped.slice(0, input.limit),
  };
}
