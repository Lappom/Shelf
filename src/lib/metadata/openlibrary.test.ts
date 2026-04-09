import { describe, expect, it, beforeEach, vi } from "vitest";

import { enrichFromOpenLibraryByIsbn } from "./openlibrary";

vi.mock("./openlibrary-cache", () => ({
  getCachedJson: vi.fn(async () => null),
  setCachedJson: vi.fn(async () => undefined),
}));

describe("enrichFromOpenLibraryByIsbn", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error - test runtime
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("/isbn/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            key: "/books/OL1M",
            number_of_pages: 123,
            works: [{ key: "/works/OLW1W" }],
          }),
        };
      }
      if (url.endsWith("/works/OLW1W.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            key: "/works/OLW1W",
            description: { value: "Desc" },
            subjects: ["A", "B"],
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
  });

  it("returns normalized enrichment", async () => {
    const res = await enrichFromOpenLibraryByIsbn("9781234567890");
    expect(res.openLibraryId).toBe("/works/OLW1W");
    expect(res.description).toBe("Desc");
    expect(res.subjects).toEqual(["A", "B"]);
    expect(res.pageCount).toBe(123);
    expect(res.coverUrl).toMatch(/covers\.openlibrary\.org/);
  });
});

