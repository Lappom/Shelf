import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchCatalogCoverFromUrl } from "@/lib/catalog/fetchCatalogCover";

describe("fetchCatalogCoverFromUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-allowlisted hosts", async () => {
    const res = await fetchCatalogCoverFromUrl("https://evil.example.com/cover.jpg");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INVALID_URL");
  });

  it("fetches Open Library ISBN cover when response is valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg", "content-length": "4" }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      })) as unknown as typeof fetch,
    );

    const res = await fetchCatalogCoverFromUrl(
      "https://covers.openlibrary.org/b/isbn/9781234567890-L.jpg",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ext).toBe("jpg");
      expect(res.bytes.length).toBe(4);
    }
  });
});
