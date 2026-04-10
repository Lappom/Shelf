import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000001" })),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimitOrThrow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin/auditLog", () => ({
  logAdminAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin/pullBooksJobs", () => ({
  requestCancelPullBooksJob: vi.fn(),
  retryPullBooksJob: vi.fn(),
}));

describe("POST /api/admin/pull-books/jobs/:id (cancel/retry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cancel_requested", async () => {
    const { requestCancelPullBooksJob } = await import("@/lib/admin/pullBooksJobs");
    (requestCancelPullBooksJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { POST } = await import("./[id]/route");

    const res = await POST(
      new Request("http://test.local/api/admin/pull-books/jobs/11111111-1111-4111-8111-111111111111", {
        method: "POST",
        headers: { Origin: "http://test.local", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "cancel_requested" });
  });

  it("returns queued for retry", async () => {
    const { retryPullBooksJob } = await import("@/lib/admin/pullBooksJobs");
    (retryPullBooksJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const { POST } = await import("./[id]/route");

    const res = await POST(
      new Request("http://test.local/api/admin/pull-books/jobs/11111111-1111-4111-8111-111111111111", {
        method: "POST",
        headers: { Origin: "http://test.local", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "queued" });
  });
});
