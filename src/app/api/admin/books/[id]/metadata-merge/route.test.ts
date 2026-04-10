import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

vi.mock("@/lib/security/cors", () => ({
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/books/metadataMergeResolution", () => ({
  loadMetadataMergeBookContext: vi.fn(),
  analyzeMetadataMerge: vi.fn(),
  defaultDecisionsFromAnalysis: vi.fn(),
}));

describe("GET /api/admin/books/[id]/metadata-merge", () => {
  it("returns analysis for EPUB book", async () => {
    const { loadMetadataMergeBookContext, analyzeMetadataMerge, defaultDecisionsFromAnalysis } =
      await import("@/lib/books/metadataMergeResolution");

    const epubNorm = { title: "A" };
    (loadMetadataMergeBookContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      ctx: {
        bookId: "b1",
        bookTitle: "A",
        contentHash: "h1",
        snapshotId: "s1",
        snapshotSyncedAt: new Date().toISOString(),
        epubNorm,
        dbNorm: epubNorm,
        snapNorm: epubNorm,
        epubRaw: {},
      },
      file: {},
    });
    (analyzeMetadataMerge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fields: [],
      automaticMerged: {},
      requiresWriteback: false,
    });
    (defaultDecisionsFromAnalysis as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const { GET } = await import("./route");
    const bookId = "00000000-0000-4000-8000-000000000001";
    const res = await GET(new Request(`http://test.local/api/admin/books/${bookId}/metadata-merge`), {
      params: Promise.resolve({ id: bookId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bookId).toBe("b1");
    expect(json.suggestedDecisions).toEqual([]);
  });
});
