import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000001" })),
}));

vi.mock("@/lib/security/cors", () => ({
  handleCorsPreflight: vi.fn(() => null),
  addCorsHeaders: vi.fn((res: unknown) => res),
}));

vi.mock("@/lib/security/origin", () => ({
  assertSameOriginFromHeaders: vi.fn(() => undefined),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin/auditLog", () => ({
  logAdminAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin/pullBooks", () => ({
  executeAdminPullBooks: vi.fn(),
}));

describe("POST /api/admin/pull-books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pull result and audits", async () => {
    const { executeAdminPullBooks } = await import("@/lib/admin/pullBooks");
    const { logAdminAudit } = await import("@/lib/admin/auditLog");

    (executeAdminPullBooks as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      created: 2,
      skipped: 1,
      nextCursor: "abc",
      items: [
        {
          status: "created",
          title: "T",
          authors: ["A"],
          open_library_id: "/works/OL1W",
          isbn_13: null,
        },
      ],
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://test.local" },
        body: JSON.stringify({ query: "q", limit: 10, dryRun: false }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(2);
    expect(json.skipped).toBe(1);
    expect(json.nextCursor).toBe("abc");
    expect(Array.isArray(json.items)).toBe(true);
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pull_books",
        actorId: "00000000-0000-4000-8000-000000000001",
        meta: expect.objectContaining({
          source: "openlibrary",
          requestedSource: "openlibrary",
          created: 2,
          skipped: 1,
          dryRun: false,
          queryLen: 1,
          hadCursor: false,
        }),
      }),
    );
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.not.objectContaining({
          query: expect.anything(),
        }),
      }),
    );
  });

  it("returns 400 without query when no cursor", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://test.local" },
        body: JSON.stringify({ limit: 5 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when query is provided with cursor", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://test.local" },
        body: JSON.stringify({ query: "q", cursor: "abc", limit: 5 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid cursor", async () => {
    const { executeAdminPullBooks } = await import("@/lib/admin/pullBooks");
    (executeAdminPullBooks as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("INVALID_CURSOR"),
    );
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://test.local" },
        body: JSON.stringify({ cursor: "bad-cursor", limit: 5 }),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid cursor" });
  });

  it("maps upstream failures to 502 without leaking message", async () => {
    const { executeAdminPullBooks } = await import("@/lib/admin/pullBooks");
    (executeAdminPullBooks as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("OpenLibrary timeout internal-details"),
    );
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://test.local" },
        body: JSON.stringify({ query: "q", limit: 5 }),
      }),
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Open Library unavailable" });
  });
});
