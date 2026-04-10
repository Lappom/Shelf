import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  enrichFromOpenLibraryByIsbn,
  enrichFromOpenLibraryForSearchCandidate,
  searchOpenLibraryByTitleAuthor,
  searchOpenLibraryCatalog,
} from "./openlibrary";

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
            publishers: ["Test Pub"],
            languages: [{ key: "/languages/eng" }],
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
    expect(res.publisher).toBe("Test Pub");
    expect(res.language).toBe("en");
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
          publishers: ["Test Pub"],
          languages: [{ key: "/languages/eng" }],
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
        coverI: null,
      },
    ]);
  });

  it("returns [] when title or author missing", async () => {
    await expect(searchOpenLibraryByTitleAuthor({ title: "", author: "x" })).resolves.toEqual([]);
    await expect(searchOpenLibraryByTitleAuthor({ title: "x", author: "" })).resolves.toEqual([]);
  });
});

describe("enrichFromOpenLibraryForSearchCandidate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error - test runtime
    global.fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/works/OLONLYW.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            key: "/works/OLONLYW",
            description: "Work only",
            subjects: ["Sci-Fi"],
          }),
        };
      }
      if (url.includes("/works/OLONLYW/editions.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            entries: [
              {
                number_of_pages: 400,
                publishers: ["PubCo"],
                languages: [{ key: "/languages/fre" }],
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
  });

  it("uses work + first edition when no ISBN", async () => {
    const res = await enrichFromOpenLibraryForSearchCandidate({
      key: "/works/OLONLYW",
      title: "T",
      authors: ["A"],
      firstPublishYear: 2000,
      isbns: [],
      coverI: null,
    });
    expect(res.description).toBe("Work only");
    expect(res.subjects).toContain("Sci-Fi");
    expect(res.pageCount).toBe(400);
    expect(res.publisher).toBe("PubCo");
    expect(res.language).toBe("fr");
    expect(res.openLibraryId).toBe("/works/OLONLYW");
  });
});

describe("searchOpenLibraryCatalog", () => {
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
                key: "/works/OL999W",
                title: "Generic",
                author_name: ["Zed"],
                first_publish_year: 1999,
                isbn: ["9789999999999"],
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
  });

  it("uses q= for generic query", async () => {
    const res = await searchOpenLibraryCatalog({ q: "asimov foundation", limit: 5 });
    expect(res).toHaveLength(1);
    expect(res[0].title).toBe("Generic");
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/search\.json\?q=/);
  });

  it("uses title-only when no author", async () => {
    const res = await searchOpenLibraryCatalog({ title: "Solo", limit: 3 });
    expect(res).toHaveLength(1);
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("title=Solo");
    expect(calledUrl).not.toContain("author=");
  });
});
