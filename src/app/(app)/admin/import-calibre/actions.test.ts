import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/calibre/parseMetadataDb", () => ({
  parseCalibreMetadataDb: vi.fn(async () => ({
    warnings: [],
    books: [
      {
        calibreBookId: 1,
        title: "A",
        description: null,
        calibrePath: "Author/A (1)",
        seriesName: null,
        authors: ["Author"],
        tags: [],
        epubFileName: "A.epub",
        coverImage: null,
      },
    ],
  })),
}));

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(() => ({
    upload: vi.fn(async (_buf: Buffer, p: string) => p),
  })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    bookFile: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/epub", () => ({
  extractEpubMetadata: vi.fn(async () => ({})),
}));

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

describe("importCalibreAction", () => {
  it("supports dry-run without writing DB", async () => {
    const { importCalibreAction } = await import("./actions");
    const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "shelf-calibre-"));
    await mkdir(join(root, "Author", "A (1)"), { recursive: true });
    await writeFile(join(root, "Author", "A (1)", "A.epub"), Buffer.from("epub"));

    const fd = new FormData();
    fd.set("metadataDb", new File([new Uint8Array([1, 2, 3])], "metadata.db"));
    fd.set("calibreLibraryRoot", root);
    fd.set("dryRun", "on");

    const res = await importCalibreAction(fd);
    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(res.stats.imported).toBe(1);

    const { prisma } = await import("@/lib/db/prisma");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ignores duplicates by content hash", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.bookFile.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      bookId: "book-existing",
    });

    const { importCalibreAction } = await import("./actions");
    const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "shelf-calibre-"));
    await mkdir(join(root, "Author", "A (1)"), { recursive: true });
    await writeFile(join(root, "Author", "A (1)", "A.epub"), Buffer.from("epub"));

    const fd = new FormData();
    fd.set("metadataDb", new File([new Uint8Array([1, 2, 3])], "metadata.db"));
    fd.set("calibreLibraryRoot", root);
    fd.set("dryRun", ""); // off

    const res = await importCalibreAction(fd);
    expect(res.stats.ignoredDuplicates).toBe(1);
    expect(res.ignored[0]?.existingBookId).toBe("book-existing");
  });
});
