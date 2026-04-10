import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000001" })),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin/pullBooksJobs", () => ({
  listPullBooksJobs: vi.fn(),
  triggerPullBooksWorker: vi.fn(async () => undefined),
}));

describe("GET /api/admin/pull-books/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns jobs list", async () => {
    const { listPullBooksJobs } = await import("@/lib/admin/pullBooksJobs");
    (listPullBooksJobs as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        status: "queued",
        attempts: 0,
        maxAttempts: 3,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        processedCandidates: 0,
        createdAt: new Date("2026-04-10T10:00:00.000Z"),
        updatedAt: new Date("2026-04-10T10:00:00.000Z"),
        startedAt: null,
        finishedAt: null,
        cancelRequestedAt: null,
      },
    ]);

    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://test.local/api/admin/pull-books/jobs?limit=10", {
        method: "GET",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobs[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(json.jobs[0]?.status).toBe("queued");
  });
});
