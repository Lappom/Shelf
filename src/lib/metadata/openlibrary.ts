import { getCachedJson, setCachedJson } from "@/lib/metadata/openlibrary-cache";
import { logShelfEvent } from "@/lib/observability/structuredLog";
import { withCircuitBreaker } from "@/lib/resilience/circuitBreaker";
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

function isTransientHttpStatus(status: number) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function getOpenLibraryTimeoutMs() {
  const raw = process.env.OPENLIBRARY_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  // Keep it short: Open Library is best-effort.
  if (Number.isFinite(n) && n >= 1000 && n <= 60_000) return Math.trunc(n);
  return 8000;
}

function getOpenLibraryRetries() {
  const raw = process.env.OPENLIBRARY_RETRIES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0 && n <= 5) return Math.trunc(n);
  return 2;
}

function backoffMs(attempt: number) {
  // attempt starts at 0; keep it small to avoid stalling ingestion/resync.
  return Math.min(1500, 200 * 2 ** attempt);
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

async function fetchJsonInner<T>(url: string, operation: "enrich" | "search"): Promise<T> {
  const timeoutMs = getOpenLibraryTimeoutMs();
  const maxRetries = getOpenLibraryRetries();
  const t0 = Date.now();

  let lastErr: unknown = null;
  let lastHttpStatus: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await rateLimitOpenLibrary();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Shelf (self-hosted)",
          Accept: "application/json",
        },
      });
      lastHttpStatus = res.status;

      if (!res.ok) {
        if (attempt < maxRetries && isTransientHttpStatus(res.status)) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new Error(`OpenLibrary error (${res.status})`);
      }

      const data = (await res.json()) as T;
      logShelfEvent("openlibrary_request", {
        operation,
        ok: true,
        httpStatus: res.status,
        durationMs: Date.now() - t0,
      });
      return data;
    } catch (e) {
      lastErr = e;
      const aborted =
        typeof e === "object" &&
        e !== null &&
        "name" in e &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any).name === "AbortError";
      if (attempt < maxRetries && (aborted || e instanceof TypeError)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      logShelfEvent("openlibrary_request", {
        operation,
        ok: false,
        httpStatus: lastHttpStatus,
        durationMs: Date.now() - t0,
        error: msg,
      });
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  const fallback = lastErr instanceof Error ? lastErr : new Error("OpenLibrary error");
  logShelfEvent("openlibrary_request", {
    operation,
    ok: false,
    httpStatus: lastHttpStatus,
    durationMs: Date.now() - t0,
    error: fallback.message,
  });
  throw fallback;
}

async function fetchJson<T>(url: string, operation: "enrich" | "search"): Promise<T> {
  return withCircuitBreaker("openlibrary", () => fetchJsonInner<T>(url, operation));
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
  const edition = await fetchJson<OpenLibraryEdition>(editionUrl, "enrich");

  const workRef = edition.works?.[0]?.key ?? null;
  let work: OpenLibraryWork | null = null;
  if (workRef) {
    const cachedWork = await getCachedJson<OpenLibraryWork>(workKey(workRef));
    if (cachedWork) {
      work = cachedWork;
    } else {
      work = await fetchJson<OpenLibraryWork>(`https://openlibrary.org${workRef}.json`, "enrich");
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
  numFound?: number;
  start?: number;
  docs?: Array<{
    key?: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    isbn?: string[];
  }>;
};

export type OpenLibraryPagedSearchResult = {
  candidates: OpenLibrarySearchCandidate[];
  numFound: number;
  start: number;
};

function mapSearchDocsToCandidates(
  docs: OpenLibrarySearchResponse["docs"],
  limit: number,
): OpenLibrarySearchCandidate[] {
  return (docs ?? [])
    .map((d) => {
      const key = typeof d.key === "string" ? d.key.trim() : "";
      const t = typeof d.title === "string" ? d.title.trim() : "";
      const authors = Array.isArray(d.author_name)
        ? d.author_name.map((a) => String(a).trim()).filter(Boolean)
        : [];
      const firstPublishYear =
        typeof d.first_publish_year === "number" ? d.first_publish_year : null;
      const isbns = Array.isArray(d.isbn)
        ? d.isbn.map((x) => String(x).trim()).filter(Boolean)
        : [];
      return { key, title: t, authors, firstPublishYear, isbns };
    })
    .filter((c) => c.key && c.title)
    .slice(0, limit);
}

/**
 * Search Open Library: generic `q`, title-only, or title+author. Cached per query shape.
 */
export async function searchOpenLibraryCatalog(args: {
  q?: string;
  title?: string;
  author?: string;
  limit?: number;
}): Promise<OpenLibrarySearchCandidate[]> {
  const limit = Math.max(1, Math.min(10, Math.trunc(args.limit ?? 10)));
  const q = (args.q ?? "").trim();
  const title = (args.title ?? "").trim();
  const author = (args.author ?? "").trim();

  let url: string;
  let cacheId: string;

  if (q) {
    cacheId = stableHash(`catalog:q:${q.toLowerCase()}:${limit}`);
    url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}`;
  } else if (title && author) {
    cacheId = stableHash(`catalog:ta:${title.toLowerCase()}:${author.toLowerCase()}:${limit}`);
    url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`;
  } else if (title) {
    cacheId = stableHash(`catalog:t:${title.toLowerCase()}:${limit}`);
    url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}`;
  } else {
    return [];
  }

  const cached = await getCachedJson<OpenLibrarySearchCandidate[]>(searchKey(cacheId));
  if (cached) return cached;

  const json = await fetchJson<OpenLibrarySearchResponse>(url, "search");
  const candidates = mapSearchDocsToCandidates(json.docs, limit);
  await setCachedJson(searchKey(cacheId), candidates);
  return candidates;
}

export async function searchOpenLibraryByTitleAuthor(args: {
  title: string;
  author: string;
  limit?: number;
}): Promise<OpenLibrarySearchCandidate[]> {
  const title = args.title.trim();
  const author = args.author.trim();
  if (!title || !author) return [];
  return searchOpenLibraryCatalog({ title, author, limit: args.limit });
}

/**
 * Paged generic `q` search for admin pull (limit 1–50, offset). Cached per (q, limit, offset).
 */
export async function searchOpenLibraryCatalogPaged(args: {
  q: string;
  limit: number;
  offset: number;
}): Promise<OpenLibraryPagedSearchResult> {
  const q = args.q.trim();
  const limit = Math.max(1, Math.min(50, Math.trunc(args.limit)));
  const offset = Math.max(0, Math.trunc(args.offset));
  if (!q) {
    return { candidates: [], numFound: 0, start: offset };
  }

  const cacheId = stableHash(`catalog:page:q:${q.toLowerCase()}:l:${limit}:o:${offset}`);
  const cached = await getCachedJson<OpenLibraryPagedSearchResult>(searchKey(cacheId));
  if (cached) return cached;

  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`;
  const json = await fetchJson<OpenLibrarySearchResponse>(url, "search");
  const numFound =
    typeof json.numFound === "number" && Number.isFinite(json.numFound) ? json.numFound : 0;
  const start = typeof json.start === "number" && Number.isFinite(json.start) ? json.start : offset;
  const candidates = mapSearchDocsToCandidates(json.docs, limit);
  const result: OpenLibraryPagedSearchResult = { candidates, numFound, start };
  await setCachedJson(searchKey(cacheId), result);
  return result;
}
