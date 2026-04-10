import {
  AdminImportJobStatus,
  AdminImportJobType,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { executeAdminPullBooks } from "@/lib/admin/pullBooks";
import { markAdminImportChunkFailure } from "@/lib/jobs/adminImportChunkFailure";
import { triggerAdminImportWorker } from "@/lib/jobs/adminImportWorker";

const PullBooksJobParamsSchema = z.object({
  source: z.enum(["openlibrary"]).default("openlibrary"),
  query: z.string().trim().min(1).max(200),
  chunkSize: z.coerce.number().int().min(1).max(50).default(20),
  dryRun: z.boolean().default(false),
  maxAttempts: z.coerce.number().int().min(1).max(5).default(3),
});

type PullBooksJobParams = z.infer<typeof PullBooksJobParamsSchema>;

function asParams(input: Prisma.JsonValue): PullBooksJobParams {
  return PullBooksJobParamsSchema.parse(input);
}

export async function enqueuePullBooksJobTx(
  tx: Prisma.TransactionClient,
  args: {
    createdById: string;
    query: string;
    chunkSize: number;
    dryRun: boolean;
    maxAttempts: number;
  },
) {
  const params = PullBooksJobParamsSchema.parse(args);
  return tx.adminImportJob.create({
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
}

export async function enqueuePullBooksJob(args: {
  createdById: string;
  query: string;
  chunkSize: number;
  dryRun: boolean;
  maxAttempts: number;
}) {
  const job = await enqueuePullBooksJobTx(prisma, args);
  void triggerAdminImportWorker();
  return job;
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

export async function runPullBooksJob(jobId: string) {
  const current = await prisma.adminImportJob.findUnique({ where: { id: jobId } });
  if (!current || current.type !== AdminImportJobType.pull_books) return;
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

  if (!current.createdById) {
    const attempts = current.attempts + 1;
    await markAdminImportChunkFailure(
      current.id,
      attempts,
      current.maxAttempts,
      "pull_books job requires createdById",
    );
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
    await markAdminImportChunkFailure(current.id, attempts, current.maxAttempts, msg);
  }
}

export async function triggerPullBooksWorker() {
  return triggerAdminImportWorker();
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
    void triggerAdminImportWorker();
  }
  return updated.count > 0;
}
