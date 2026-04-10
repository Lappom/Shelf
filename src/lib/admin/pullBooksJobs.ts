import { AdminImportJobStatus, AdminImportJobType, type Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { executeAdminPullBooks } from "@/lib/admin/pullBooks";

const PullBooksJobParamsSchema = z.object({
  source: z.enum(["openlibrary"]).default("openlibrary"),
  query: z.string().trim().min(1).max(200),
  chunkSize: z.coerce.number().int().min(1).max(50).default(20),
  dryRun: z.boolean().default(false),
  maxAttempts: z.coerce.number().int().min(1).max(5).default(3),
});

type PullBooksJobParams = z.infer<typeof PullBooksJobParamsSchema>;

let workerRunning = false;

function lockOwnerId() {
  return `pull-books-worker-${process.pid}`;
}

function asParams(input: Prisma.JsonValue): PullBooksJobParams {
  return PullBooksJobParamsSchema.parse(input);
}

function computeBackoffMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

export async function enqueuePullBooksJob(args: {
  createdById: string;
  query: string;
  chunkSize: number;
  dryRun: boolean;
  maxAttempts: number;
}) {
  const params = PullBooksJobParamsSchema.parse(args);
  const job = await prisma.adminImportJob.create({
    data: {
      type: AdminImportJobType.pull_books,
      status: AdminImportJobStatus.queued,
      params: {
        source: params.source,
        query: params.query,
        chunkSize: params.chunkSize,
        dryRun: params.dryRun,
        maxAttempts: params.maxAttempts,
      },
      maxAttempts: params.maxAttempts,
      createdById: args.createdById,
      nextRunAt: new Date(),
    },
    select: { id: true, status: true },
  });
  void triggerPullBooksWorker();
  return job;
}

async function claimNextPullBooksJob() {
  const now = new Date();
  const candidate = await prisma.adminImportJob.findFirst({
    where: {
      type: AdminImportJobType.pull_books,
      status: { in: [AdminImportJobStatus.queued, AdminImportJobStatus.running] },
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      finishedAt: null,
    },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true },
  });
  if (!candidate) return null;

  const updated = await prisma.adminImportJob.updateMany({
    where: {
      id: candidate.id,
      OR: [{ status: AdminImportJobStatus.queued }, { status: AdminImportJobStatus.running }],
      finishedAt: null,
    },
    data: {
      status: AdminImportJobStatus.running,
      lockedAt: now,
      lockOwner: lockOwnerId(),
      startedAt: now,
    },
  });
  if (updated.count === 0) return null;

  return prisma.adminImportJob.findUnique({
    where: { id: candidate.id },
  });
}

async function persistPullBooksItems(
  jobId: string,
  items: Awaited<ReturnType<typeof executeAdminPullBooks>>["items"],
) {
  if (items.length === 0) return;
  await prisma.adminImportJobItem.createMany({
    data: items.map((it) => ({
      jobId,
      status: it.status,
      title: it.title,
      authors: it.authors,
      openLibraryId: it.open_library_id,
      isbn13: it.isbn_13,
      error: null,
    })),
  });
}

async function markJobChunkFailure(
  jobId: string,
  attempts: number,
  maxAttempts: number,
  errorMessage: string,
) {
  const terminal = attempts >= maxAttempts;
  const nextRunAt = terminal ? null : new Date(Date.now() + computeBackoffMs(attempts));
  await prisma.adminImportJob.update({
    where: { id: jobId },
    data: {
      attempts,
      status: terminal ? AdminImportJobStatus.dead_letter : AdminImportJobStatus.failed,
      nextRunAt,
      lockOwner: null,
      lockedAt: null,
      lastError: errorMessage.slice(0, 500),
      finishedAt: terminal ? new Date() : null,
    },
  });
}

async function runPullBooksJob(jobId: string) {
  const current = await prisma.adminImportJob.findUnique({ where: { id: jobId } });
  if (!current) return;
  const params = asParams(current.params);

  if (current.cancelRequestedAt) {
    await prisma.adminImportJob.update({
      where: { id: current.id },
      data: {
        status: AdminImportJobStatus.cancelled,
        finishedAt: new Date(),
        lockOwner: null,
        lockedAt: null,
      },
    });
    return;
  }

  try {
    const result = await executeAdminPullBooks({
      adminUserId: current.createdById,
      query: params.query,
      limit: params.chunkSize,
      cursor: current.lastCursor,
      dryRun: params.dryRun,
    });

    await persistPullBooksItems(current.id, result.items);

    const done = result.nextCursor === null;
    await prisma.adminImportJob.update({
      where: { id: current.id },
      data: {
        attempts: 0,
        createdCount: { increment: result.created },
        skippedCount: { increment: result.skipped },
        processedCandidates: { increment: result.items.length },
        errorCount: {
          increment: result.items.filter((it) => it.status !== "created" && it.status !== "skipped")
            .length,
        },
        lastCursor: result.nextCursor,
        status: done ? AdminImportJobStatus.succeeded : AdminImportJobStatus.queued,
        nextRunAt: done ? null : new Date(),
        lockOwner: null,
        lockedAt: null,
        finishedAt: done ? new Date() : null,
        lastError: null,
      },
    });
  } catch (error) {
    const attempts = current.attempts + 1;
    const msg = error instanceof Error ? error.message : "Unknown pull books job error";
    await markJobChunkFailure(current.id, attempts, current.maxAttempts, msg);
  }
}

export async function triggerPullBooksWorker() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    // Keep draining to make retry/cancel observable quickly.
    for (;;) {
      const job = await claimNextPullBooksJob();
      if (!job) break;
      await runPullBooksJob(job.id);
    }
  } finally {
    workerRunning = false;
  }
}

export async function listPullBooksJobs(limit = 25) {
  return prisma.adminImportJob.findMany({
    where: { type: AdminImportJobType.pull_books },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(1, Math.min(100, Math.trunc(limit))),
    select: {
      id: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      createdCount: true,
      updatedCount: true,
      skippedCount: true,
      errorCount: true,
      processedCandidates: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      finishedAt: true,
      cancelRequestedAt: true,
    },
  });
}

export async function getPullBooksJob(jobId: string) {
  const job = await prisma.adminImportJob.findFirst({
    where: { id: jobId, type: AdminImportJobType.pull_books },
    include: {
      items: {
        orderBy: [{ createdAt: "desc" }],
        take: 500,
      },
    },
  });
  return job;
}

export async function requestCancelPullBooksJob(jobId: string) {
  const updated = await prisma.adminImportJob.updateMany({
    where: {
      id: jobId,
      type: AdminImportJobType.pull_books,
      status: { in: [AdminImportJobStatus.queued, AdminImportJobStatus.running] },
      cancelRequestedAt: null,
    },
    data: { cancelRequestedAt: new Date() },
  });
  return updated.count > 0;
}

export async function retryPullBooksJob(jobId: string) {
  const updated = await prisma.adminImportJob.updateMany({
    where: {
      id: jobId,
      type: AdminImportJobType.pull_books,
      status: {
        in: [
          AdminImportJobStatus.failed,
          AdminImportJobStatus.dead_letter,
          AdminImportJobStatus.cancelled,
        ],
      },
    },
    data: {
      status: AdminImportJobStatus.queued,
      attempts: 0,
      nextRunAt: new Date(),
      finishedAt: null,
      cancelRequestedAt: null,
      lockOwner: null,
      lockedAt: null,
      lastError: null,
    },
  });
  if (updated.count > 0) {
    void triggerPullBooksWorker();
  }
  return updated.count > 0;
}
