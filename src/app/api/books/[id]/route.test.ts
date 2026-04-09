import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/security/cors", () => ({
  handleCorsPreflight: vi.fn(() => null),
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/origin", () => ({
  assertSameOriginFromHeaders: vi.fn(() => undefined),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("DELETE /api/books/[id]", () => {
  it("returns 404 when book not found", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { DELETE } = await import("./route");
    const req = new Request("http://test.local/api/books/x", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(404);
  });

  it("soft-deletes when active", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      deletedAt: null,
    });
    (prisma.book.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
    });

    const { DELETE } = await import("./route");
    const req = new Request("http://test.local/api/books/x", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(200);
  });

  it("is idempotent when already deleted", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      deletedAt: new Date(),
    });

    const { DELETE } = await import("./route");
    const req = new Request("http://test.local/api/books/x", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(200);
  });
});
