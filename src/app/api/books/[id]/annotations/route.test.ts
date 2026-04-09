import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: crypto.randomUUID() })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: { findFirst: vi.fn() },
    userAnnotation: {
      findMany: vi.fn(),
      create: vi.fn(),
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

describe("GET /api/books/[id]/annotations", () => {
  it("returns list payload", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.userAnnotation.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: crypto.randomUUID(),
        type: "highlight",
        cfiRange: "epubcfi(/6/2[chapter]!/4/2/2)",
        content: "Hello",
        note: null,
        color: "#ffee55",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/books/x/annotations");
    const res = await GET(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.annotations)).toBe(true);
    expect(json.annotations[0].type).toBe("highlight");
  });
});

describe("POST /api/books/[id]/annotations", () => {
  it("rejects invalid color", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      format: "epub",
    });

    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/books/x/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "highlight",
        cfiRange: "epubcfi(/6/2[chapter]!/4/2/2)",
        color: "yellow",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(400);
  });

  it("creates annotation for EPUB", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      format: "epub",
    });
    (prisma.userAnnotation.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      type: "bookmark",
      cfiRange: "epubcfi(/6/2[chapter]!/4/2/2)",
      content: null,
      note: null,
      color: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { POST } = await import("./route");
    const req = new Request("http://test.local/api/books/x/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bookmark",
        cfiRange: "epubcfi(/6/2[chapter]!/4/2/2)",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: crypto.randomUUID() }) });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.type).toBe("bookmark");
  });
});
