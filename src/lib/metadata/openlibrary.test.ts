import { describe, expect, it, beforeEach, vi } from "vitest";

import { enrichFromOpenLibraryByIsbn, searchOpenLibraryByTitleAuthor } from "./openlibrary";

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

  it("retries on transient errors", async () => {
    let calls = 0;
    // @ts-expect-error - test runtime
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false, status: 502, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          key: "/books/OL1M",
          number_of_pages: 123,
          works: [{ key: "/works/OLW1W" }],
        }),
      };
    });

    const res = await enrichFromOpenLibraryByIsbn("9781234567890");
    expect(res.pageCount).toBe(123);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe("searchOpenLibraryByTitleAuthor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error - test runtime
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("/search.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            docs: [
              {
                key: "/works/OL123W",
                title: "The Book",
                author_name: ["Ada Lovelace"],
                first_publish_year: 1843,
                isbn: ["9781234567890", "123456789X"],
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
  });

  it("returns normalized candidates", async () => {
    const res = await searchOpenLibraryByTitleAuthor({
      title: "The Book",
      author: "Ada",
      limit: 10,
    });
    expect(res).toEqual([
      {
        key: "/works/OL123W",
        title: "The Book",
        authors: ["Ada Lovelace"],
        firstPublishYear: 1843,
        isbns: ["9781234567890", "123456789X"],
      },
    ]);
  });

  it("returns [] when title or author missing", async () => {
    await expect(searchOpenLibraryByTitleAuthor({ title: "", author: "x" })).resolves.toEqual([]);
    await expect(searchOpenLibraryByTitleAuthor({ title: "x", author: "" })).resolves.toEqual([]);
  });
});
