import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: crypto.randomUUID() })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAnnotation: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/security/cors", () => ({
  handleCorsPreflight: vi.fn(() => null),
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/origin", () => ({
  assertSameOriginFromHeaders: vi.fn(() => undefined),
}));

describe("PATCH /api/annotations/[id]", () => {
  it("returns 404 when missing", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.userAnnotation.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    const { PATCH } = await import("./route");
    const req = new Request("http://test.local/api/annotations/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "x" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(404);
  });

  it("updates annotation", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.userAnnotation.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
    });
    (prisma.userAnnotation.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      type: "highlight",
      cfiRange: "epubcfi(/6/2[chapter]!/4/2/2)",
      content: "Hello",
      note: "Note",
      color: "#ffee55",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { PATCH } = await import("./route");
    const req = new Request("http://test.local/api/annotations/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Note" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.note).toBe("Note");
  });
});

describe("DELETE /api/annotations/[id]", () => {
  it("deletes annotation", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.userAnnotation.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
    });
    (prisma.userAnnotation.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
    });

    const { DELETE } = await import("./route");
    const req = new Request("http://test.local/api/annotations/x", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(204);
  });
});
