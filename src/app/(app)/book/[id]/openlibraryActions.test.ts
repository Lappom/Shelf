import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1", role: "admin" })),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow: vi.fn(async () => undefined),
}));

const prismaMock = {
  book: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

vi.mock("@/lib/storage/paths", () => ({
  buildCoverStoragePath: vi.fn(
    ({ bookId, ext }: { bookId: string; ext: string }) => `covers/${bookId}.${ext}`,
  ),
}));

const adapterMock = { upload: vi.fn(async () => "ok") };
vi.mock("@/lib/storage", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/storage")>();
  return { ...mod, getStorageAdapter: vi.fn(() => adapterMock) };
});

vi.mock("@/lib/metadata/openlibrary", () => ({
  enrichFromOpenLibraryByIsbn: vi.fn(async () => ({
    openLibraryId: "/works/OLW1W",
    description: "OL DESC",
    subjects: ["S1", "S2"],
    pageCount: 321,
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781234567890-L.jpg",
  })),
  searchOpenLibraryByTitleAuthor: vi.fn(async () => [
    {
      key: "/works/OL123W",
      title: "The Book",
      authors: ["Ada"],
      firstPublishYear: 1843,
      isbns: ["9781234567890"],
    },
  ]),
}));

vi.mock("@/lib/metadata/openlibraryCover", () => ({
  fetchOpenLibraryCoverByIsbn: vi.fn(async () => ({
    ok: true,
    bytes: Buffer.from("IMG"),
    ext: "jpg",
    contentType: "image/jpeg",
  })),
}));

describe("openlibraryActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("openLibrarySearchForBookAction returns candidates", async () => {
    prismaMock.book.findFirst.mockResolvedValueOnce({
      id: "b1",
      title: "T",
      authors: ["A"],
    });

    const { openLibrarySearchForBookAction } = await import("./openlibraryActions");
    const res = await openLibrarySearchForBookAction({ bookId: crypto.randomUUID() });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.candidates.length).toBe(1);
  });

  it("openLibraryApplyEnrichmentAction complements fields (no overwrite) and stores cover when missing", async () => {
    const bookId = crypto.randomUUID();
    prismaMock.book.findFirst.mockResolvedValueOnce({
      id: bookId,
      title: "T",
      authors: ["A"],
      language: "en",
      description: "DB DESC",
      isbn10: null,
      isbn13: null,
      publisher: null,
      publishDate: null,
      subjects: ["DBS"],
      pageCount: null,
      openLibraryId: null,
      coverUrl: null,
    });
    prismaMock.book.update.mockResolvedValue({ id: bookId });

    const { openLibraryApplyEnrichmentAction } = await import("./openlibraryActions");
    const res = await openLibraryApplyEnrichmentAction({
      bookId,
      isbn: "978-1234567890",
      applyCoverIfMissing: true,
      forceCover: false,
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.coverUpdated).toBe(true);
    expect(adapterMock.upload).toHaveBeenCalled();

    // Should not overwrite description/subjects if already present in DB.
    const updateCalls = prismaMock.book.update.mock.calls;
    const mainUpdate = updateCalls.find((c) => c?.[0]?.data?.metadataSource);
    expect(mainUpdate?.[0]?.data?.description).toBe("DB DESC");
    expect(mainUpdate?.[0]?.data?.subjects).toEqual(["DBS"]);
    expect(mainUpdate?.[0]?.data?.pageCount).toBe(321);
    expect(mainUpdate?.[0]?.data?.openLibraryId).toBe("/works/OLW1W");
  });
});
