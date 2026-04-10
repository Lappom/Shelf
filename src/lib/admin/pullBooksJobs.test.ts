import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/client", () => ({
  AdminImportJobType: { pull_books: "pull_books", recommendations_recompute: "recommendations_recompute" },
  AdminImportJobStatus: {
    queued: "queued",
    running: "running",
    succeeded: "succeeded",
    failed: "failed",
    cancelled: "cancelled",
    dead_letter: "dead_letter",
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    adminImportJob: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    adminImportJobItem: {
      createMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/admin/pullBooks", () => ({
  executeAdminPullBooks: vi.fn(),
}));

import {
  deletePullBooksJob,
  enqueuePullBooksJob,
  requestCancelPullBooksJob,
  retryPullBooksJob,
  triggerPullBooksWorker,
} from "@/lib/admin/pullBooksJobs";
import { prisma } from "@/lib/db/prisma";
import { executeAdminPullBooks } from "@/lib/admin/pullBooks";

describe("pullBooksJobs service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues a job and triggers worker", async () => {
    const createMock = prisma.adminImportJob.create as unknown as ReturnType<typeof vi.fn>;
    const findFirstMock = prisma.adminImportJob.findFirst as unknown as ReturnType<typeof vi.fn>;
    createMock.mockResolvedValue({ id: "job-1", status: "queued" });
    findFirstMock.mockResolvedValue(null);

    const out = await enqueuePullBooksJob({
      createdById: "00000000-0000-4000-8000-000000000001",
      query: "bible",
      chunkSize: 20,
      dryRun: true,
      maxAttempts: 3,
    });
    expect(out.id).toBe("job-1");
    expect(createMock).toHaveBeenCalled();
  });

  it("marks cancel request for queued/running job", async () => {
    const updateManyMock = prisma.adminImportJob.updateMany as unknown as ReturnType<typeof vi.fn>;
    updateManyMock.mockResolvedValue({ count: 1 });

    const ok = await requestCancelPullBooksJob("job-1");
    expect(ok).toBe(true);
    expect(updateManyMock).toHaveBeenCalled();
  });

  it("deletes pull-books job when not running", async () => {
    const deleteManyMock = prisma.adminImportJob.deleteMany as unknown as ReturnType<typeof vi.fn>;
    deleteManyMock.mockResolvedValue({ count: 1 });

    const out = await deletePullBooksJob("job-1");
    expect(out).toEqual({ ok: true });
    expect(deleteManyMock).toHaveBeenCalled();
  });

  it("refuses delete when job is running", async () => {
    const deleteManyMock = prisma.adminImportJob.deleteMany as unknown as ReturnType<typeof vi.fn>;
    const findFirstMock = prisma.adminImportJob.findFirst as unknown as ReturnType<typeof vi.fn>;
    deleteManyMock.mockResolvedValue({ count: 0 });
    findFirstMock.mockResolvedValue({ id: "job-1", status: "running" });

    const out = await deletePullBooksJob("job-1");
    expect(out).toEqual({ ok: false, reason: "running" });
  });

  it("requeues terminal job on retry", async () => {
    const updateManyMock = prisma.adminImportJob.updateMany as unknown as ReturnType<typeof vi.fn>;
    const findFirstMock = prisma.adminImportJob.findFirst as unknown as ReturnType<typeof vi.fn>;
    updateManyMock.mockResolvedValue({ count: 1 });
    findFirstMock.mockResolvedValue(null);

    const ok = await retryPullBooksJob("job-1");
    expect(ok).toBe(true);
  });

  it("recovers a running job (crash-recovery simulation)", async () => {
    const findFirstMock = prisma.adminImportJob.findFirst as unknown as ReturnType<typeof vi.fn>;
    const updateManyMock = prisma.adminImportJob.updateMany as unknown as ReturnType<typeof vi.fn>;
    const findUniqueMock = prisma.adminImportJob.findUnique as unknown as ReturnType<typeof vi.fn>;
    const updateMock = prisma.adminImportJob.update as unknown as ReturnType<typeof vi.fn>;
    const createManyMock = prisma.adminImportJobItem.createMany as unknown as ReturnType<
      typeof vi.fn
    >;
    const executeMock = executeAdminPullBooks as unknown as ReturnType<typeof vi.fn>;

    findFirstMock.mockResolvedValueOnce({ id: "job-running" }).mockResolvedValueOnce(null);
    updateManyMock.mockResolvedValue({ count: 1 });
    findUniqueMock.mockResolvedValue({
      id: "job-running",
      type: "pull_books",
      status: "running",
      params: {
        source: "openlibrary",
        query: "history",
        chunkSize: 10,
        dryRun: true,
        maxAttempts: 3,
      },
      processedCandidates: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      attempts: 0,
      maxAttempts: 3,
      lastCursor: null,
      nextRunAt: new Date(),
      lockedAt: null,
      lockOwner: null,
      cancelRequestedAt: null,
      startedAt: null,
      finishedAt: null,
      lastError: null,
      createdById: "00000000-0000-4000-8000-000000000001",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    executeMock.mockResolvedValue({
      created: 1,
      skipped: 0,
      nextCursor: null,
      items: [
        {
          status: "created",
          title: "Recovered",
          authors: ["A"],
          open_library_id: "/works/OL1W",
          isbn_13: "9780306406157",
        },
      ],
    });
    createManyMock.mockResolvedValue({ count: 1 });
    updateMock.mockResolvedValue({});

    await triggerPullBooksWorker();

    expect(executeMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-running" },
        data: expect.objectContaining({ status: "succeeded" }),
      }),
    );
  });
});
