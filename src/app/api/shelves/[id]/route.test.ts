import { describe, expect, it, vi } from "vitest";

type TxMock = {
  bookShelf: { deleteMany: ReturnType<typeof vi.fn> };
  shelfRule: { deleteMany: ReturnType<typeof vi.fn> };
  shelf: { delete: ReturnType<typeof vi.fn> };
};

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
      update: vi.fn(),
      delete: vi.fn(),
    },
    bookShelf: {
      deleteMany: vi.fn(),
    },
    shelfRule: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: TxMock) => Promise<void>) =>
      fn({
        bookShelf: { deleteMany: vi.fn(async () => undefined) },
        shelfRule: { deleteMany: vi.fn(async () => undefined) },
        shelf: { delete: vi.fn(async () => undefined) },
      }),
    ),
  },
}));

describe("/api/shelves/[id]", () => {
  it("PATCH updates shelf", async () => {
    const shelfId = crypto.randomUUID();
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.shelf.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: shelfId,
      type: "manual",
    });
    (prisma.shelf.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: shelfId });

    const { PATCH } = await import("./route");
    const req = new Request(`http://test.local/api/shelves/${shelfId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New name" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: shelfId }) });
    expect(res.status).toBe(200);
  });

  it("DELETE removes shelf", async () => {
    const shelfId = crypto.randomUUID();
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.shelf.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: shelfId,
      type: "manual",
    });

    const { DELETE } = await import("./route");
    const req = new Request(`http://test.local/api/shelves/${shelfId}`, { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: shelfId }) });
    expect(res.status).toBe(200);
  });
});
