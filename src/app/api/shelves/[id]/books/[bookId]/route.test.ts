import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: crypto.randomUUID() })),
}));

vi.mock("@/lib/security/cors", () => ({
  handleCorsPreflight: vi.fn(() => null),
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    shelf: {
      findFirst: vi.fn(),
    },
    bookShelf: {
      deleteMany: vi.fn(),
    },
  },
}));

describe("DELETE /api/shelves/[id]/books/[bookId]", () => {
  it("removes a book from shelf", async () => {
    const shelfId = crypto.randomUUID();
    const bookId = crypto.randomUUID();

    const { prisma } = await import("@/lib/db/prisma");
    (prisma.shelf.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: shelfId,
      type: "manual",
    });
    (prisma.bookShelf.deleteMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });

    const { DELETE } = await import("./route");
    const req = new Request(`http://test.local/api/shelves/${shelfId}/books/${bookId}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: shelfId, bookId }) });
    expect(res.status).toBe(204);
  });
});
