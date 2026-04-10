import { AdminImportJobStatus, AdminImportJobType, type Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { recomputeRecommendationsForUser } from "@/lib/recommendations/recomputeForUser";

import { markAdminImportChunkFailure } from "@/lib/jobs/adminImportChunkFailure";

const RecommendationsJobParamsSchema = z.object({
  batchSize: z.coerce.number().int().min(1).max(50).default(25),
  maxAttempts: z.coerce.number().int().min(1).max(5).default(3),
});

type RecommendationsJobParams = z.infer<typeof RecommendationsJobParamsSchema>;

function asParams(input: Prisma.JsonValue): RecommendationsJobParams {
  return RecommendationsJobParamsSchema.parse(input);
}

export async function ensureRecommendationsRecomputeJob(args: {
  batchSize: number;
  maxAttempts: number;
}) {
  const params = RecommendationsJobParamsSchema.parse({
    batchSize: args.batchSize,
    maxAttempts: args.maxAttempts,
  });

  const existing = await prisma.adminImportJob.findFirst({
    where: {
      type: AdminImportJobType.recommendations_recompute,
      status: { in: [AdminImportJobStatus.queued, AdminImportJobStatus.running] },
    },
    select: { id: true, status: true },
  });
  if (existing) {
    return { job: existing, created: false as const };
  }

  const job = await prisma.adminImportJob.create({
    data: {
      type: AdminImportJobType.recommendations_recompute,
      status: AdminImportJobStatus.queued,
      params: {
        batchSize: params.batchSize,
        maxAttempts: params.maxAttempts,
      },
      maxAttempts: params.maxAttempts,
      createdById: null,
      nextRunAt: new Date(),
    },
    select: { id: true, status: true },
  });
  return { job, created: true as const };
}

export async function runRecommendationsRecomputeJob(jobId: string) {
  const current = await prisma.adminImportJob.findUnique({ where: { id: jobId } });
  if (!current || current.type !== AdminImportJobType.recommendations_recompute) return;

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
    const afterId = current.lastCursor?.trim() || null;

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" },
      take: params.batchSize,
      select: { id: true },
    });

    let chunkErrors = 0;
    for (const u of users) {
      try {
        await recomputeRecommendationsForUser(u.id);
      } catch {
        chunkErrors += 1;
      }
    }

    const lastUserId = users.length > 0 ? users[users.length - 1]!.id : null;
    const noMore = users.length < params.batchSize;
    const done = noMore;

    await prisma.adminImportJob.update({
      where: { id: current.id },
      data: {
        attempts: 0,
        processedCandidates: { increment: users.length },
        errorCount: { increment: chunkErrors },
        lastCursor: done ? null : lastUserId,
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
    const msg =
      error instanceof Error ? error.message : "Unknown recommendations recompute job error";
    await markAdminImportChunkFailure(current.id, attempts, current.maxAttempts, msg);
  }
}
