import { describe, expect, it, vi, beforeEach } from "vitest";

const adapterMock = {
  download: vi.fn(async () => Buffer.from("EPUB_BYTES")),
  upload: vi.fn(async () => "ok"),
  delete: vi.fn(async () => undefined),
  exists: vi.fn(),
  getUrl: vi.fn(),
  getSize: vi.fn(),
};

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => adapterMock),
}));

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

vi.mock("@/lib/epub", () => ({
  extractEpubMetadata: vi.fn(async () => ({
    title: "T",
    authors: ["A"],
    language: "en",
    description: "Old",
    isbn10: "0306406152",
    isbn13: "9781234567890",
    cover: null,
  })),
  writeEpubOpfMetadata: vi.fn(async () => Buffer.from("EPUB_BYTES_UPDATED")),
}));

const prismaMock = {
  book: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  bookFile: {
    update: vi.fn(),
  },
  bookMetadataSnapshot: {
    update: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    await fn(prismaMock as unknown);
  }),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

describe("resyncBookMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapterMock.download.mockResolvedValue(Buffer.from("EPUB_BYTES"));
  });

  it("performs writeback when DB changed and EPUB matches snapshot", async () => {
    const bookId = crypto.randomUUID();

    prismaMock.book.findFirst.mockResolvedValueOnce({
      id: bookId,
      contentHash: "oldhash",
      title: "T",
      authors: ["A"],
      language: "en",
      description: "New from DB",
      isbn10: "0306406152",
      isbn13: "9781234567890",
      publisher: null,
      publishDate: null,
      subjects: [],
      pageCount: null,
      openLibraryId: null,
      format: "epub",
      files: [
        {
          id: crypto.randomUUID(),
          storagePath: "epub/a/file.epub",
          filename: "file.epub",
          mimeType: "application/epub+zip",
          contentHash: "oldhash",
        },
      ],
      snapshot: {
        id: crypto.randomUUID(),
        epubMetadata: {},
        dbMetadata: {
          title: "T",
          authors: ["A"],
          language: "en",
          description: "Old",
          isbn10: "0306406152",
          isbn13: "9781234567890",
          publisher: null,
          publishDate: null,
          subjects: [],
          pageCount: null,
          openLibraryId: null,
        },
      },
    });

    prismaMock.book.findFirst.mockResolvedValueOnce(null); // collision check

    const { resyncBookMetadata } = await import("./metadataSync");
    const res = await resyncBookMetadata(bookId);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.writeback).toBe(true);
      expect(adapterMock.upload).toHaveBeenCalled();
      expect(prismaMock.book.update).toHaveBeenCalled();
      expect(prismaMock.bookFile.update).toHaveBeenCalled();
      expect(prismaMock.bookMetadataSnapshot.update).toHaveBeenCalled();
    }
  });

  it("fails safely on content hash collision", async () => {
    const bookId = crypto.randomUUID();

    prismaMock.book.findFirst.mockResolvedValueOnce({
      id: bookId,
      contentHash: "oldhash",
      title: "T",
      authors: ["A"],
      language: "en",
      description: "New from DB",
      isbn10: "0306406152",
      isbn13: "9781234567890",
      publisher: null,
      publishDate: null,
      subjects: [],
      pageCount: null,
      openLibraryId: null,
      format: "epub",
      files: [
        {
          id: crypto.randomUUID(),
          storagePath: "epub/a/file.epub",
          filename: "file.epub",
          mimeType: "application/epub+zip",
          contentHash: "oldhash",
        },
      ],
      snapshot: {
        id: crypto.randomUUID(),
        epubMetadata: {},
        dbMetadata: {
          title: "T",
          authors: ["A"],
          language: "en",
          description: "Old",
          isbn10: "0306406152",
          isbn13: "9781234567890",
          publisher: null,
          publishDate: null,
          subjects: [],
          pageCount: null,
          openLibraryId: null,
        },
      },
    });

    prismaMock.book.findFirst.mockResolvedValueOnce({ id: crypto.randomUUID() }); // collision

    const { resyncBookMetadata } = await import("./metadataSync");
    const res = await resyncBookMetadata(bookId);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/collision/i);
    }
    expect(adapterMock.upload).not.toHaveBeenCalled();
  });
});

