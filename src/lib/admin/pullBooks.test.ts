import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/metadata/openlibrary", () => ({
  buildOpenLibraryCoverUrl: vi.fn(
    (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
  ),
  searchOpenLibraryCatalogPaged: vi.fn(),
}));

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

import {
  executeAdminPullBooks,
  findExistingBookForCandidate,
  normalizeOpenLibraryId,
} from "@/lib/admin/pullBooks";
import { prisma } from "@/lib/db/prisma";
import { searchOpenLibraryCatalogPaged } from "@/lib/metadata/openlibrary";
import { updateBookSearchVector } from "@/lib/search/searchVector";

describe("normalizeOpenLibraryId", () => {
  it("keeps leading slash keys", () => {
    expect(normalizeOpenLibraryId("/works/OL45804W")).toBe("/works/OL45804W");
  });

  it("adds leading slash when missing", () => {
    expect(normalizeOpenLibraryId("works/OL1W")).toBe("/works/OL1W");
  });

  it("returns null for blank", () => {
    expect(normalizeOpenLibraryId("")).toBeNull();
    expect(normalizeOpenLibraryId("   ")).toBeNull();
  });
});

describe("findExistingBookForCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dedups by open_library_id first", async () => {
    const findFirst = prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>;
    findFirst.mockResolvedValueOnce({ id: "book-1" });
    const existing = await findExistingBookForCandidate({
      key: "/works/OL1W",
      title: "Title",
      authors: ["A"],
      firstPublishYear: 2000,
      isbns: [],
    });
    expect(existing).toEqual({ id: "book-1" });
  });

  it("falls back to isbn13 dedup", async () => {
    const findFirst = prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>;
    findFirst.mockReset();
    findFirst.mockResolvedValueOnce({ id: "book-2" });
    const existing = await findExistingBookForCandidate({
      key: "",
      title: "Title",
      authors: ["A"],
      firstPublishYear: 2000,
      isbns: ["9780306406157"],
    });
    expect(existing).toEqual({ id: "book-2" });
  });

  it("uses heuristic only when no ol id and no isbn13", async () => {
    const findFirst = prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>;
    const findMany = prisma.book.findMany as unknown as ReturnType<typeof vi.fn>;
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([{ id: "book-3", authors: ["Jane Doe"] }]);
    const existing = await findExistingBookForCandidate({
      key: "",
      title: "Fuzzy Title",
      authors: ["Jane"],
      firstPublishYear: null,
      isbns: [],
    });
    expect(existing).toEqual({ id: "book-3" });
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("executeAdminPullBooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("supports dry-run without DB writes", async () => {
    const searchMock = searchOpenLibraryCatalogPaged as unknown as ReturnType<typeof vi.fn>;
    const findFirst = prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>;
    const createMock = prisma.book.create as unknown as ReturnType<typeof vi.fn>;
    findFirst.mockReset();
    createMock.mockReset();
    searchMock.mockResolvedValue({
      candidates: [
        {
          key: "/works/OL10W",
          title: "Dry Run Book",
          authors: ["A"],
          firstPublishYear: 2001,
          isbns: ["9780306406157"],
        },
      ],
      numFound: 1,
      start: 0,
    });
    findFirst.mockResolvedValue(null);

    const res = await executeAdminPullBooks({
      adminUserId: "00000000-0000-4000-8000-000000000001",
      query: "dry run",
      limit: 20,
      cursor: null,
      dryRun: true,
    });

    expect(res.created).toBe(1);
    expect(res.skipped).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
    expect(updateBookSearchVector).not.toHaveBeenCalled();
  });

  it("creates missing books and updates search vector", async () => {
    const searchMock = searchOpenLibraryCatalogPaged as unknown as ReturnType<typeof vi.fn>;
    const findFirst = prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>;
    const createMock = prisma.book.create as unknown as ReturnType<typeof vi.fn>;
    findFirst.mockReset();
    createMock.mockReset();
    searchMock.mockResolvedValue({
      candidates: [
        {
          key: "/works/OL11W",
          title: "New Book",
          authors: ["Author One"],
          firstPublishYear: 2002,
          isbns: ["9780306406157"],
        },
      ],
      numFound: 1,
      start: 0,
    });
    findFirst.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: "new-book-id" });

    const res = await executeAdminPullBooks({
      adminUserId: "00000000-0000-4000-8000-000000000001",
      query: "create",
      limit: 20,
      cursor: null,
      dryRun: false,
    });

    expect(res.created).toBe(1);
    expect(res.skipped).toBe(0);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateBookSearchVector).toHaveBeenCalledWith("new-book-id");
    expect(res.items[0]?.status).toBe("created");
  });
});
