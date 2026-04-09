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
      findMany: vi.fn(),
      create: vi.fn(),
    },
    shelfRule: {
      create: vi.fn(),
    },
  },
}));

describe("/api/shelves", () => {
  it("GET returns shelves list", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.shelf.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: crypto.randomUUID(),
        name: "Shelf A",
        description: null,
        icon: "⭐",
        type: "manual",
        sortOrder: 0,
        createdAt: new Date(),
        _count: { books: 3 },
      },
    ]);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://test.local/api/shelves"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.shelves)).toBe(true);
    expect(json.shelves[0].name).toBe("Shelf A");
  });

  it("POST creates a shelf", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.shelf.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
    });

    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/shelves", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "manual", name: "My shelf", description: null, icon: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(typeof json.shelfId).toBe("string");
  });
});
