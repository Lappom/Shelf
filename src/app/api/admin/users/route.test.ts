import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
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
    user: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/admin/users", () => {
  it("returns user list", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.user.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: crypto.randomUUID(),
        email: "a@example.com",
        username: "a",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://test.local/api/admin/users"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.users)).toBe(true);
  });
});
