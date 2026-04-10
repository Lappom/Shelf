/**
 * Fetch a catalog cover image from a known provider URL (server-side, allowlisted).
 * Used when adding a book from an external catalog so coverUrl points at storage, not hotlinks.
 */

function getCatalogCoverMaxBytes() {
  const raw = process.env.CATALOG_COVER_FETCH_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 25 * 1024 * 1024) return Math.trunc(n);
  return 5 * 1024 * 1024;
}

function getCatalogCoverTimeoutMs() {
  const raw = process.env.CATALOG_COVER_FETCH_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1000 && n <= 60_000) return Math.trunc(n);
  return 12_000;
}

function extFromContentType(ct: string): "jpg" | "png" | "webp" | null {
  const t = ct.split(";")[0]?.trim().toLowerCase() ?? "";
  if (t === "image/jpeg") return "jpg";
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  return null;
}

function isAllowedCatalogCoverUrl(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  const path = url.pathname;

  if (h === "covers.openlibrary.org") {
    return path.startsWith("/b/isbn/") || path.startsWith("/b/id/");
  }

  if (h === "books.google.com" || h === "www.books.google.com") {
    return path.startsWith("/books/content") || path.startsWith("/books/publisher");
  }

  if (h === "books.googleusercontent.com" || h.endsWith(".googleusercontent.com")) {
    return true;
  }

  return false;
}

export type FetchCatalogCoverResult =
  | { ok: true; bytes: Buffer; ext: "jpg" | "png" | "webp" }
  | { ok: false; code: "INVALID_URL" | "UNSUPPORTED_TYPE" | "TOO_LARGE" | "HTTP_ERROR" | "NETWORK" };

/**
 * Downloads image bytes from a catalog cover URL after hostname/path allowlist checks.
 */
export async function fetchCatalogCoverFromUrl(rawUrl: string): Promise<FetchCatalogCoverResult> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, code: "INVALID_URL" };
  }

  if (url.username || url.password) return { ok: false, code: "INVALID_URL" };
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, code: "INVALID_URL" };
  const host = url.hostname.toLowerCase();
  const isBooksGoogleHttp =
    host === "books.google.com" || host === "www.books.google.com";
  if (url.protocol === "http:" && !isBooksGoogleHttp) {
    return { ok: false, code: "INVALID_URL" };
  }

  if (!isAllowedCatalogCoverUrl(url)) return { ok: false, code: "INVALID_URL" };

  const maxBytes = getCatalogCoverMaxBytes();
  const timeoutMs = getCatalogCoverTimeoutMs();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Shelf (self-hosted)",
        Accept: "image/*",
      },
    });

    if (res.status === 404) return { ok: false, code: "HTTP_ERROR" };
    if (!res.ok) return { ok: false, code: "HTTP_ERROR" };

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const ext = extFromContentType(contentType);
    if (!ext) return { ok: false, code: "UNSUPPORTED_TYPE" };

    const lenHeader = res.headers.get("content-length");
    const declared = lenHeader ? Number(lenHeader) : NaN;
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, code: "TOO_LARGE" };

    const ab = await res.arrayBuffer();
    if (ab.byteLength <= 0 || ab.byteLength > maxBytes) return { ok: false, code: "TOO_LARGE" };

    return { ok: true, bytes: Buffer.from(ab), ext };
  } catch {
    return { ok: false, code: "NETWORK" };
  } finally {
    clearTimeout(t);
  }
}
