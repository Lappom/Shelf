import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/storage", () => ({
  getStorageAdapter: vi.fn(),
  StorageError: class StorageError extends Error {
    override name = "StorageError";
    constructor(
      message: string,
      public readonly code: string = "UNKNOWN",
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: PrismaTxMock) => Promise<void>) => {
      const tx: PrismaTxMock = {
        bookFile: { deleteMany: vi.fn(async () => undefined) },
        bookMetadataSnapshot: { deleteMany: vi.fn(async () => undefined) },
        bookShelf: { deleteMany: vi.fn(async () => undefined) },
        bookTag: { deleteMany: vi.fn(async () => undefined) },
        userBookProgress: { deleteMany: vi.fn(async () => undefined) },
        userAnnotation: { deleteMany: vi.fn(async () => undefined) },
        userRecommendation: { deleteMany: vi.fn(async () => undefined) },
        book: { delete: vi.fn(async () => undefined) },
      };
      await fn(tx);
    }),
  },
}));

type PrismaTxMock = {
  bookFile: { deleteMany: ReturnType<typeof vi.fn> };
  bookMetadataSnapshot: { deleteMany: ReturnType<typeof vi.fn> };
  bookShelf: { deleteMany: ReturnType<typeof vi.fn> };
  bookTag: { deleteMany: ReturnType<typeof vi.fn> };
  userBookProgress: { deleteMany: ReturnType<typeof vi.fn> };
  userAnnotation: { deleteMany: ReturnType<typeof vi.fn> };
  userRecommendation: { deleteMany: ReturnType<typeof vi.fn> };
  book: { delete: ReturnType<typeof vi.fn> };
};

describe("purgeBookAction", () => {
  it("purges storage paths then deletes DB rows", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      deletedAt: new Date(),
      coverUrl: "covers/1.jpg",
      files: [{ storagePath: "epub/A/file.epub" }],
    });

    const { getStorageAdapter } = await import("@/lib/storage");
    (getStorageAdapter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      delete: vi.fn(async () => undefined),
    });

    const { purgeBookAction } = await import("./actions");
    const fd = new FormData();
    fd.set("bookId", crypto.randomUUID());
    const res = await purgeBookAction(fd);
    expect(res.ok).toBe(true);
  });

  it("requires soft-delete before purge", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      deletedAt: null,
      coverUrl: null,
      files: [],
    });

    const { purgeBookAction } = await import("./actions");
    const fd = new FormData();
    fd.set("bookId", crypto.randomUUID());
    await expect(purgeBookAction(fd)).rejects.toThrow(/soft-deleted/i);
  });
});
