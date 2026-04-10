import { createHash } from "node:crypto";

import { getCachedJson, setCachedJson } from "@/lib/metadata/openlibrary-cache";
import { logShelfEvent } from "@/lib/observability/structuredLog";
import { withCircuitBreaker } from "@/lib/resilience/circuitBreaker";

export type GoogleBooksSearchCandidate = {
  providerId: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  isbns: string[];
  language: string | null;
  coverPreviewUrl: string | null;
};

type GoogleBooksVolumeResponse = {
  items?: Array<{
    id?: string;
    volumeInfo?: {
      title?: string;
      authors?: string[];
      publishedDate?: string;
      language?: string;
      industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
      imageLinks?: {
        extraLarge?: string;
        large?: string;
        medium?: string;
        small?: string;
        thumbnail?: string;
        smallThumbnail?: string;
      };
    };
  }>;
};

function stableHash(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function cacheKey(key: string) {
  return `googlebooks:search:${key}`;
}

function getGoogleBooksTimeoutMs() {
  const raw = process.env.GOOGLE_BOOKS_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1000 && n <= 60_000) return Math.trunc(n);
  return 6000;
}

function getGoogleBooksRetries() {
  const raw = process.env.GOOGLE_BOOKS_RETRIES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0 && n <= 5) return Math.trunc(n);
  return 1;
}

function isTransientHttpStatus(status: number) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function toYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

async function sleep(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchGoogleBooksJsonInner(url: string): Promise<GoogleBooksVolumeResponse> {
  const timeoutMs = getGoogleBooksTimeoutMs();
  const retries = getGoogleBooksRetries();
  const t0 = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Shelf (self-hosted)",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        if (attempt < retries && isTransientHttpStatus(res.status)) {
          await sleep(150 * (attempt + 1));
          continue;
        }
        throw new Error(`GoogleBooks error (${res.status})`);
      }

      const data = (await res.json()) as GoogleBooksVolumeResponse;
      logShelfEvent("openlibrary_request", {
        operation: "search",
        provider: "googlebooks",
        ok: true,
        httpStatus: res.status,
        durationMs: Date.now() - t0,
      });
      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < retries) {
        await sleep(150 * (attempt + 1));
        continue;
      }
      logShelfEvent("openlibrary_request", {
        operation: "search",
        provider: "googlebooks",
        ok: false,
        durationMs: Date.now() - t0,
        error: msg,
      });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("GoogleBooks error");
}

async function fetchGoogleBooksJson(url: string): Promise<GoogleBooksVolumeResponse> {
  return withCircuitBreaker("googlebooks", () => fetchGoogleBooksJsonInner(url));
}

function mapToCandidates(
  json: GoogleBooksVolumeResponse,
  limit: number,
): GoogleBooksSearchCandidate[] {
  return (json.items ?? [])
    .map((item) => {
      const providerId = item.id?.trim() ?? "";
      const volume = item.volumeInfo;
      const title = volume?.title?.trim() ?? "";
      const authors =
        volume?.authors
          ?.map((author) => author.trim())
          .filter(Boolean)
          .slice(0, 10) ?? [];
      const isbns =
        volume?.industryIdentifiers
          ?.map((identifier) => identifier.identifier?.trim() ?? "")
          .filter(Boolean) ?? [];
      const links = volume?.imageLinks;
      const coverPreviewUrl =
        links?.extraLarge ??
        links?.large ??
        links?.medium ??
        links?.small ??
        links?.thumbnail ??
        links?.smallThumbnail ??
        null;
      return {
        providerId,
        title,
        authors,
        firstPublishYear: toYear(volume?.publishedDate),
        isbns,
        language: volume?.language?.trim() ?? null,
        coverPreviewUrl,
      };
    })
    .filter((candidate) => candidate.providerId.length > 0 && candidate.title.length > 0)
    .slice(0, limit);
}

export async function searchGoogleBooksCatalog(args: {
  q?: string;
  title?: string;
  author?: string;
  limit?: number;
}): Promise<GoogleBooksSearchCandidate[]> {
  const limit = Math.max(1, Math.min(10, Math.trunc(args.limit ?? 10)));
  const q = (args.q ?? "").trim();
  const title = (args.title ?? "").trim();
  const author = (args.author ?? "").trim();

  let query: string;
  if (q) {
    query = q;
  } else if (title && author) {
    query = `intitle:${title} inauthor:${author}`;
  } else if (title) {
    query = `intitle:${title}`;
  } else {
    return [];
  }

  const key = stableHash(`${query.toLowerCase()}:${limit}`);
  const cached = await getCachedJson<GoogleBooksSearchCandidate[]>(cacheKey(key));
  if (cached) return cached;

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${limit}&printType=books`;
  const json = await fetchGoogleBooksJson(url);
  const candidates = mapToCandidates(json, limit);
  await setCachedJson(cacheKey(key), candidates);
  return candidates;
}
