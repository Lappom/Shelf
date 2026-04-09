import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: { findFirst: vi.fn() },
    bookTag: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

describe("book tagActions", () => {
  it("addBookTagAction rejects when book is missing", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { addBookTagAction } = await import("./tagActions");
    await expect(
      addBookTagAction({ bookId: crypto.randomUUID(), tagId: crypto.randomUUID() }),
    ).rejects.toThrow(/introuvable/i);
  });

  it("addBookTagAction upserts pivot and updates vector", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
    });

    const { updateBookSearchVector } = await import("@/lib/search/searchVector");
    const { addBookTagAction } = await import("./tagActions");
    const bookId = crypto.randomUUID();
    const tagId = crypto.randomUUID();
    const res = await addBookTagAction({ bookId, tagId });
    expect(res.ok).toBe(true);
    expect(prisma.bookTag.upsert).toHaveBeenCalled();
    expect(updateBookSearchVector).toHaveBeenCalledWith(bookId);
  });

  it("removeBookTagAction deletes pivot and updates vector", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
    });

    const { updateBookSearchVector } = await import("@/lib/search/searchVector");
    const { removeBookTagAction } = await import("./tagActions");
    const bookId = crypto.randomUUID();
    const tagId = crypto.randomUUID();
    const res = await removeBookTagAction({ bookId, tagId });
    expect(res.ok).toBe(true);
    expect(prisma.bookTag.deleteMany).toHaveBeenCalled();
    expect(updateBookSearchVector).toHaveBeenCalledWith(bookId);
  });
});
