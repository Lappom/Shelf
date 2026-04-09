import { getCachedJson, setCachedJson } from "@/lib/metadata/openlibrary-cache";
import { createHash } from "node:crypto";

type OpenLibraryEdition = {
  key?: string;
  title?: string;
  description?: string | { value?: string };
  number_of_pages?: number;
  subjects?: string[];
  works?: Array<{ key?: string }>;
};

type OpenLibraryWork = {
  key?: string;
  description?: string | { value?: string };
  subjects?: string[];
};

export type OpenLibraryEnrichment = {
  openLibraryId: string | null;
  description: string | null;
  subjects: string[];
  pageCount: number | null;
  coverUrl: string | null;
};

export type OpenLibrarySearchCandidate = {
  key: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  isbns: string[];
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

let lastRequestAtMs = 0;

async function rateLimitOpenLibrary() {
  const rps = Number(process.env.OPENLIBRARY_RATE_LIMIT?.trim() || "1");
  const minIntervalMs = Number.isFinite(rps) && rps > 0 ? Math.ceil(1000 / rps) : 1000;
  const now = Date.now();
  const wait = Math.max(0, lastRequestAtMs + minIntervalMs - now);
  if (wait > 0) await sleep(wait);
  lastRequestAtMs = Date.now();
}

function coerceText(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") {
    const o = v as { value?: unknown };
    if (typeof o.value === "string") return o.value.trim() || null;
  }
  return null;
}

async function fetchJson<T>(url: string): Promise<T> {
  await rateLimitOpenLibrary();
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Shelf (self-hosted)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`OpenLibrary error (${res.status})`);
  return (await res.json()) as T;
}

function isbnKey(isbn: string) {
  return `openlibrary:isbn:${isbn}`;
}

function workKey(workKey: string) {
  return `openlibrary:work:${workKey}`;
}

function searchKey(key: string) {
  return `openlibrary:search:${key}`;
}

function stableHash(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function buildOpenLibraryCoverUrl(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
}

export async function enrichFromOpenLibraryByIsbn(isbn: string): Promise<OpenLibraryEnrichment> {
  const cached = await getCachedJson<OpenLibraryEnrichment>(isbnKey(isbn));
  if (cached) return cached;

  const editionUrl = `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`;
  const edition = await fetchJson<OpenLibraryEdition>(editionUrl);

  const workRef = edition.works?.[0]?.key ?? null;
  let work: OpenLibraryWork | null = null;
  if (workRef) {
    const cachedWork = await getCachedJson<OpenLibraryWork>(workKey(workRef));
    if (cachedWork) {
      work = cachedWork;
    } else {
      work = await fetchJson<OpenLibraryWork>(`https://openlibrary.org${workRef}.json`);
      await setCachedJson(workKey(workRef), work);
    }
  }

  const description = coerceText(edition.description) ?? coerceText(work?.description) ?? null;
  const subjects = Array.from(
    new Set([...(edition.subjects ?? []), ...(work?.subjects ?? [])].filter(Boolean)),
  ).slice(0, 50);

  const openLibraryId = (work?.key ?? edition.key ?? null) || null;
  const pageCount = typeof edition.number_of_pages === "number" ? edition.number_of_pages : null;
  const coverUrl = buildOpenLibraryCoverUrl(isbn);

  const enrichment: OpenLibraryEnrichment = {
    openLibraryId,
    description,
    subjects,
    pageCount,
    coverUrl,
  };

  await setCachedJson(isbnKey(isbn), enrichment);
  return enrichment;
}

type OpenLibrarySearchResponse = {
  docs?: Array<{
    key?: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    isbn?: string[];
  }>;
};

export async function searchOpenLibraryByTitleAuthor(args: {
  title: string;
  author: string;
  limit?: number;
}): Promise<OpenLibrarySearchCandidate[]> {
  const title = args.title.trim();
  const author = args.author.trim();
  const limit = Math.max(1, Math.min(10, Math.trunc(args.limit ?? 10)));
  if (!title || !author) return [];

  const cacheId = stableHash(`${title.toLowerCase()}|${author.toLowerCase()}|${limit}`);
  const cached = await getCachedJson<OpenLibrarySearchCandidate[]>(searchKey(cacheId));
  if (cached) return cached;

  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
  const json = await fetchJson<OpenLibrarySearchResponse>(url);

  const candidates: OpenLibrarySearchCandidate[] = (json.docs ?? [])
    .map((d) => {
      const key = typeof d.key === "string" ? d.key.trim() : "";
      const t = typeof d.title === "string" ? d.title.trim() : "";
      const authors = Array.isArray(d.author_name) ? d.author_name.map((a) => String(a).trim()).filter(Boolean) : [];
      const firstPublishYear = typeof d.first_publish_year === "number" ? d.first_publish_year : null;
      const isbns = Array.isArray(d.isbn) ? d.isbn.map((x) => String(x).trim()).filter(Boolean) : [];
      return { key, title: t, authors, firstPublishYear, isbns };
    })
    .filter((c) => c.key && c.title)
    .slice(0, limit);

  await setCachedJson(searchKey(cacheId), candidates);
  return candidates;
}
