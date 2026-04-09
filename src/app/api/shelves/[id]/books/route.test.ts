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
      upsert: vi.fn(),
    },
  },
}));

describe("POST /api/shelves/[id]/books", () => {
  it("adds a book to shelf", async () => {
    const shelfId = crypto.randomUUID();
    const bookId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    const { requireUser } = await import("@/lib/auth/rbac");
    (requireUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: userId });

    const { prisma } = await import("@/lib/db/prisma");
    (prisma.shelf.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: shelfId,
      type: "manual",
    });
    (prisma.bookShelf.upsert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const { POST } = await import("./route");
    const req = new Request(`http://test.local/api/shelves/${shelfId}/books`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookId }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: shelfId }) });
    expect(res.status).toBe(200);
  });
});
