import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: crypto.randomUUID() })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    book: { findFirst: vi.fn() },
    userBookProgress: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/recommendations/trigger", () => ({
  scheduleRecommendationsRecompute: vi.fn(),
}));

vi.mock("@/lib/security/cors", () => ({
  handleCorsPreflight: vi.fn(() => null),
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/origin", () => ({
  assertSameOriginFromHeaders: vi.fn(() => undefined),
}));

describe("GET /api/progress/[bookId]", () => {
  it("returns default payload when missing", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.userBookProgress.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/progress/x");
    const res = await GET(req, { params: Promise.resolve({ bookId: crypto.randomUUID() }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.progress).toBe(0);
    expect(json.currentCfi).toBe(null);
    expect(json.status).toBe("not_started");
    expect(json.totalReadingSeconds).toBe(0);
  });
});

describe("PUT /api/progress/[bookId]", () => {
  it("rejects invalid payload", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      format: "epub",
    });

    const { PUT } = await import("./route");
    const req = new Request("http://test.local/api/progress/x", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: 2 }),
    });
    const res = await PUT(req, { params: Promise.resolve({ bookId: crypto.randomUUID() }) });
    expect(res.status).toBe(400);
  });

  it("upserts progress for EPUB", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: crypto.randomUUID(),
      format: "epub",
    });
    (prisma.userBookProgress.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (prisma.userBookProgress.upsert as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      progress: 0.25,
      currentCfi: "epubcfi(/6/2[chapter]!/4/2/2)",
      currentPage: null,
      status: "reading",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      updatedAt: new Date().toISOString(),
      totalReadingSeconds: 0,
      lastProgressClientAt: new Date().toISOString(),
    });

    const { PUT } = await import("./route");
    const req = new Request("http://test.local/api/progress/x", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: 0.25, currentCfi: "epubcfi(/6/2[chapter]!/4/2/2)" }),
    });
    const res = await PUT(req, { params: Promise.resolve({ bookId: crypto.randomUUID() }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.progress).toBe(0.25);
    expect(json.status).toBe("reading");
  });

  it("returns 404 when book not found", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.book.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { PUT } = await import("./route");
    const req = new Request("http://test.local/api/progress/x", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress: 0.1 }),
    });
    const res = await PUT(req, { params: Promise.resolve({ bookId: crypto.randomUUID() }) });
    expect(res.status).toBe(404);
  });
});
