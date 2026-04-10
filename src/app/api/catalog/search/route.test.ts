import { describe, expect, it, vi, beforeEach } from "vitest";

const searchOpenLibraryCatalog = vi.fn();
const rateLimitOrThrow = vi.fn(async () => undefined);

vi.mock("@/lib/auth/rbac", () => ({
  requireUser: vi.fn(async () => ({ id: crypto.randomUUID() })),
}));

vi.mock("@/lib/security/cors", () => ({
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/metadata/openlibrary", () => ({
  searchOpenLibraryCatalog,
  buildOpenLibraryCoverUrl: (isbn: string) =>
    `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow,
}));

describe("GET /api/catalog/search", () => {
  beforeEach(() => {
    searchOpenLibraryCatalog.mockReset();
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
    searchOpenLibraryCatalog.mockResolvedValue([
      {
        key: "/works/OL1W",
        title: "T",
        authors: ["A"],
        firstPublishYear: 2000,
        isbns: ["9781234567890"],
      },
      {
        key: "/works/OL2W",
        title: "No isbn",
        authors: ["B"],
        firstPublishYear: null,
        isbns: ["not-a-valid-isbn"],
      },
    ]);

    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/catalog/search?q=foundation");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      candidates: Array<{ coverPreviewUrl: string | null; isbns: string[] }>;
    };
    expect(json.candidates.length).toBe(2);
    expect(json.candidates[0].coverPreviewUrl).toMatch(/covers\.openlibrary\.org/);
    expect(json.candidates[1].coverPreviewUrl).toBeNull();
    expect(searchOpenLibraryCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ q: "foundation" }),
    );
  });

  it("returns 502 when Open Library fails", async () => {
    searchOpenLibraryCatalog.mockRejectedValue(new Error("OpenLibrary error (500)"));
    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/catalog/search?title=Test");
    const res = await GET(req);
    expect(res.status).toBe(502);
  });

  it("applies per-user and ip rate limit", async () => {
    searchOpenLibraryCatalog.mockResolvedValue([]);
    const { GET } = await import("./route");
    const req = new Request("http://test.local/api/catalog/search?q=foundation");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(rateLimitOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^catalog:openlibrary:/),
        limit: 30,
        windowMs: 60_000,
      }),
    );
  });
});
