import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/search/searchVector", () => ({
  updateBookSearchVector: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    tag: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    bookTag: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("admin tags actions", () => {
  it("createTagAction rejects invalid color", async () => {
    const { createTagAction } = await import("./actions");
    await expect(createTagAction({ name: "x", color: "red" })).rejects.toThrow(/invalide/i);
  });

  it("createTagAction rejects duplicate name (case-insensitive)", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.tag.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "t1" });

    const { createTagAction } = await import("./actions");
    await expect(createTagAction({ name: "To-Read", color: "#777169" })).rejects.toThrow(/existe/i);
  });

  it("deleteTagAction rejects when tag is used", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.bookTag.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const { deleteTagAction } = await import("./actions");
    await expect(deleteTagAction({ tagId: crypto.randomUUID() })).rejects.toThrow(/utilisé/i);
  });

  it("updateTagAction recomputes vectors when name changes", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.tag.findFirst as unknown as ReturnType<typeof vi.fn>)
      // assertTagNameAvailable (no duplicate)
      .mockResolvedValueOnce(null)
      // before
      .mockResolvedValueOnce({ name: "old" });

    (prisma.tag.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      name: "new",
      color: "#777169",
    });

    (prisma.bookTag.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { bookId: crypto.randomUUID() },
      { bookId: crypto.randomUUID() },
    ]);

    const { updateBookSearchVector } = await import("@/lib/search/searchVector");
    const { updateTagAction } = await import("./actions");
    const tagId = crypto.randomUUID();
    await updateTagAction({ tagId, name: "new", color: "#777169" });

    expect(updateBookSearchVector).toHaveBeenCalledTimes(2);
  });
});

