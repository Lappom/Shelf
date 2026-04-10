import { describe, expect, it, vi, beforeEach } from "vitest";

const searchCatalogPreview = vi.fn();
const rateLimitOrThrow = vi.fn(async () => undefined);

vi.mock("@/lib/auth/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: crypto.randomUUID() })),
}));

vi.mock("@/lib/security/cors", () => ({
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/catalog/searchCatalogPreview", () => ({
  searchCatalogPreview,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow,
}));

describe("GET /api/catalog/search", () => {
  beforeEach(() => {
    searchCatalogPreview.mockReset();
    rateLimitOrThrow.mockClear();
  });

  it("returns 400 when q and title are both sent", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/catalog/search?q=foo&title=bar");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither q nor title", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/catalog/search");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns candidates with coverPreviewUrl", async () => {
    searchCatalogPreview.mockResolvedValue({
      partial: false,
      providers: { openlibrary: { ok: true }, googlebooks: { ok: true } },
      candidates: [
        {
          provider: "openlibrary",
          providerId: "/works/OL1W",
          key: "/works/OL1W",
          title: "T",
          authors: ["A"],
          firstPublishYear: 2000,
          isbns: ["9781234567890"],
          language: null,
          relevanceScore: 0.9,
          coverPreviewUrl: "https://covers.openlibrary.org/b/isbn/9781234567890-L.jpg",
        },
      ],
    });

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/catalog/search?q=foundation");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      partial: boolean;
      candidates: Array<{ coverPreviewUrl: string | null; isbns: string[] }>;
    };
    expect(json.partial).toBe(false);
    expect(json.candidates.length).toBe(1);
    expect(json.candidates[0].coverPreviewUrl).toMatch(/covers\.openlibrary\.org/);
    expect(searchCatalogPreview).toHaveBeenCalledWith(expect.objectContaining({ q: "foundation" }));
  });

  it("returns 502 when all providers fail", async () => {
    searchCatalogPreview.mockRejectedValue(new Error("CATALOG_UNAVAILABLE"));
    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/catalog/search?title=Test");
    const res = await GET(req);
    expect(res.status).toBe(502);
  });

  it("applies per-user and ip rate limit", async () => {
    searchCatalogPreview.mockResolvedValue({
      partial: false,
      providers: { openlibrary: { ok: true }, googlebooks: { ok: true } },
      candidates: [],
    });
    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/catalog/search?q=foundation");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(rateLimitOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^catalog:external:/),
        limit: 30,
        windowMs: 60_000,
      }),
    );
  });
});
