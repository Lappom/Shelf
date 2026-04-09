import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: crypto.randomUUID() })),
}));

vi.mock("@/lib/security/cors", () => ({
  handleCorsPreflight: vi.fn(() => null),
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/origin", () => ({
  assertSameOriginFromHeaders: vi.fn(() => undefined),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

function decodeCursor(cursor: string) {
  const normalized = cursor.replaceAll("-", "+").replaceAll("_", "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const json = Buffer.from(normalized + pad, "base64").toString("utf8");
  return JSON.parse(json) as unknown;
}

describe("GET /api/search", () => {
  const prevSecret = process.env.NEXTAUTH_SECRET;
  beforeAll(() => {
    process.env.NEXTAUTH_SECRET = "z".repeat(32);
  });
  afterAll(() => {
    if (prevSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = prevSecret;
  });

  it("returns 400 on invalid pages range", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/search?q=abc&pagesMin=10&pagesMax=1");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns results and a cursor (relevance)", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    (prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: idA,
        title: "A",
        authors: ["Ada"],
        description: null,
        coverUrl: "covers/a.jpg",
        format: "epub",
        language: "fr",
        pageCount: 10,
        createdAt: new Date(),
        publishDate: "2020",
        progress: 0.5,
        rank: 0.123,
        sortValue: 0.123,
      },
      {
        id: idB,
        title: "B",
        authors: ["Bob"],
        description: null,
        coverUrl: null,
        format: "epub",
        language: "fr",
        pageCount: 11,
        createdAt: new Date(),
        publishDate: "2021",
        progress: 0.2,
        rank: 0.12,
        sortValue: 0.12,
      },
    ]);

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/search?q=test&limit=2&sort=relevance");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: unknown[]; nextCursor: string | null };
    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBe(2);
    expect(typeof json.nextCursor).toBe("string");

    const decoded = decodeCursor(json.nextCursor as string) as { kind?: string };
    expect(decoded.kind).toBe("relevance");

    const r0 = json.results[0] as { coverUrl: string | null; coverToken: string | null };
    const r1 = json.results[1] as { coverUrl: string | null; coverToken: string | null };
    expect(r0.coverUrl).toBeTruthy();
    expect(typeof r0.coverToken).toBe("string");
    expect(r0.coverToken?.length).toBeGreaterThan(10);
    expect(r1.coverToken).toBeNull();
  });

  it("returns 400 on invalid cursor", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/search?q=test&cursor=not-base64");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
