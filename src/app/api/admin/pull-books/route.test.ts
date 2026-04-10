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

vi.mock("@/lib/admin/pullBooksJobs", () => ({
  enqueuePullBooksJob: vi.fn(),
}));

describe("POST /api/admin/pull-books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pull result and audits", async () => {
    const { enqueuePullBooksJob } = await import("@/lib/admin/pullBooksJobs");
    const { logAdminAudit } = await import("@/lib/admin/auditLog");
    const { rateLimitOrThrow } = await import("@/lib/security/rateLimit");

    (enqueuePullBooksJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: "queued",
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://test.local" },
        body: JSON.stringify({ query: "q", chunkSize: 10, dryRun: false }),
      }),
    );

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.jobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(json.status).toBe("queued");
    expect(logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pull_books_job_create",
        actorId: "00000000-0000-4000-8000-000000000001",
        meta: expect.objectContaining({
          source: "openlibrary",
          requestedSource: "openlibrary",
          dryRun: false,
          chunkSize: 10,
          queryLen: 1,
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
    expect(rateLimitOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^admin:pull_books:/),
        limit: 18,
        windowMs: 60_000,
      }),
    );
  });

  it("returns 400 without query", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://test.local" },
        body: JSON.stringify({ chunkSize: 5 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid chunkSize", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://test.local/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://test.local" },
        body: JSON.stringify({ query: "q", chunkSize: 200 }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
