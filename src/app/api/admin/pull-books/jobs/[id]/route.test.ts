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
  deletePullBooksJob: vi.fn(),
  getPullBooksJob: vi.fn(),
}));

describe("DELETE /api/admin/pull-books/jobs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 when job deleted", async () => {
    const { deletePullBooksJob } = await import("@/lib/admin/pullBooksJobs");
    (deletePullBooksJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://test.local/api/admin/pull-books/jobs/11111111-1111-4111-8111-111111111111", {
        method: "DELETE",
        headers: { Origin: "http://test.local" },
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(res.status).toBe(200);
  });

  it("returns 409 when job is running", async () => {
    const { deletePullBooksJob } = await import("@/lib/admin/pullBooksJobs");
    (deletePullBooksJob as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      reason: "running",
    });

    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://test.local/api/admin/pull-books/jobs/11111111-1111-4111-8111-111111111111", {
        method: "DELETE",
        headers: { Origin: "http://test.local" },
      }),
      { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(res.status).toBe(409);
  });
});
