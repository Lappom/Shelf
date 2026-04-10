import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchOpenLibraryCatalog: vi.fn(),
  searchGoogleBooksCatalog: vi.fn(),
}));

vi.mock("@/lib/metadata/openlibrary", () => ({
  searchOpenLibraryCatalog: mocks.searchOpenLibraryCatalog,
  buildOpenLibraryCoverUrl: (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
  buildOpenLibraryCoverUrlByCoverId: (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`,
}));

vi.mock("@/lib/metadata/googlebooks", () => ({
  searchGoogleBooksCatalog: mocks.searchGoogleBooksCatalog,
}));

import { searchCatalogPreview } from "@/lib/catalog/searchCatalogPreview";

describe("searchCatalogPreview", () => {
  it("returns partial results when one provider fails", async () => {
    mocks.searchOpenLibraryCatalog.mockResolvedValue([
      {
        key: "/works/OL1W",
        title: "Foundation",
        authors: ["Isaac Asimov"],
        firstPublishYear: 1951,
        isbns: ["9781234567890"],
        coverI: null,
      },
    ]);
    mocks.searchGoogleBooksCatalog.mockRejectedValue(new Error("provider down"));

    const result = await searchCatalogPreview({ q: "foundation", limit: 10 });
    expect(result.partial).toBe(true);
    expect(result.providers.openlibrary.ok).toBe(true);
    expect(result.providers.googlebooks.ok).toBe(false);
    expect(result.candidates.length).toBe(1);
  });

  it("uses Open Library cover id when ISBN is missing", async () => {
    mocks.searchOpenLibraryCatalog.mockResolvedValue([
      {
        key: "/works/OL9W",
        title: "No ISBN work",
        authors: ["X"],
        firstPublishYear: null,
        isbns: [],
        coverI: 12345,
      },
    ]);
    mocks.searchGoogleBooksCatalog.mockRejectedValue(new Error("down"));

    const result = await searchCatalogPreview({ q: "nisb", limit: 10 });
    expect(result.candidates[0]?.coverPreviewUrl).toBe(
      "https://covers.openlibrary.org/b/id/12345-L.jpg",
    );
  });
});
