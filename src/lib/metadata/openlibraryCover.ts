type OpenLibraryCoverResult =
  | { ok: true; bytes: Buffer; ext: "jpg" | "png" | "webp"; contentType: string }
  | { ok: false; code: "NOT_FOUND" | "UNSUPPORTED_TYPE" | "TOO_LARGE" | "HTTP_ERROR" | "NETWORK" };

function getCoverMaxBytes() {
  const raw = process.env.OPENLIBRARY_COVER_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0 && n <= 25 * 1024 * 1024) return Math.trunc(n);
  return 5 * 1024 * 1024;
}

function getCoverTimeoutMs() {
  const raw = process.env.OPENLIBRARY_COVER_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1000 && n <= 60_000) return Math.trunc(n);
  return 8000;
}

function extFromContentType(ct: string): "jpg" | "png" | "webp" | null {
  const t = ct.split(";")[0]?.trim().toLowerCase() ?? "";
  if (t === "image/jpeg") return "jpg";
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  return null;
}

export async function fetchOpenLibraryCoverByIsbn(isbn: string): Promise<OpenLibraryCoverResult> {
  const url = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
  const timeoutMs = getCoverTimeoutMs();
  const maxBytes = getCoverMaxBytes();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Shelf (self-hosted)",
        Accept: "image/*",
      },
    });

    if (res.status === 404) return { ok: false, code: "NOT_FOUND" };
    if (!res.ok) return { ok: false, code: "HTTP_ERROR" };

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const ext = extFromContentType(contentType);
    if (!ext) return { ok: false, code: "UNSUPPORTED_TYPE" };

    const lenHeader = res.headers.get("content-length");
    const declared = lenHeader ? Number(lenHeader) : NaN;
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, code: "TOO_LARGE" };

    const ab = await res.arrayBuffer();
    if (ab.byteLength <= 0 || ab.byteLength > maxBytes) return { ok: false, code: "TOO_LARGE" };
    return { ok: true, bytes: Buffer.from(ab), ext, contentType };
  } catch {
    return { ok: false, code: "NETWORK" };
  } finally {
    clearTimeout(t);
  }
}
