import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin/auditLog", () => ({
  logAdminAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => ({
    upload: vi.fn(async () => "ok"),
    download: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    getUrl: vi.fn(),
    getSize: vi.fn(),
    createReadStream: vi.fn(),
  })),
}));

vi.mock("@/lib/epub", () => ({
  extractEpubMetadata: vi.fn(async () => ({
    title: "T",
    authors: ["A"],
    language: "en",
    description: "D",
    isbn10: null,
    isbn13: "9781234567890",
    cover: { bytes: Buffer.from("x"), mimeType: "image/jpeg", ext: "jpg" },
  })),
}));

vi.mock("@/lib/metadata/openlibrary", () => ({
  enrichFromOpenLibraryByIsbn: vi.fn(async () => ({
    openLibraryId: "/works/OLW1W",
    description: "OL",
    subjects: ["S"],
    pageCount: 10,
    coverUrl: "https://covers.openlibrary.org/b/isbn/9781234567890-L.jpg",
  })),
}));

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

const prismaMock = {
  book: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  bookFile: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  bookMetadataSnapshot: {
    create: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    await fn(prismaMock as unknown);
  }),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

describe("ingestEpub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns DUPLICATE_ACTIVE when active book has same hash", async () => {
    prismaMock.book.findFirst.mockResolvedValueOnce({ id: "book-1" }); // active duplicate
    const { ingestEpub } = await import("./ingest");
    const res = await ingestEpub({
      epubBytes: Buffer.from("same"),
      filename: "x.epub",
      mimeType: "application/epub+zip",
      addedByUserId: "u1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("DUPLICATE_ACTIVE");
  });

  it("creates a new book and snapshot", async () => {
    prismaMock.book.findFirst.mockResolvedValueOnce(null); // no active dup
    prismaMock.book.findFirst.mockResolvedValueOnce(null); // no deleted match by hash
    prismaMock.book.findFirst.mockResolvedValueOnce(null); // no deleted match by filename
    prismaMock.book.create.mockResolvedValueOnce({ id: "book-new" });

    const { ingestEpub } = await import("./ingest");
    const res = await ingestEpub({
      epubBytes: Buffer.from("epub"),
      filename: "x.epub",
      mimeType: "application/epub+zip",
      addedByUserId: "u1",
    });

    expect(res).toEqual({ ok: true, bookId: "book-new", restored: false });
    expect(prismaMock.bookFile.create).toHaveBeenCalled();
    expect(prismaMock.bookMetadataSnapshot.create).toHaveBeenCalled();
  });
});
