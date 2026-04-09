import { getCachedJson, setCachedJson } from "@/lib/metadata/openlibrary-cache";

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
