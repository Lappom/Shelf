import { AdminImportJobStatus, type AdminImportJobType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

function lockOwnerId(prefix: string) {
  return `${prefix}-${process.pid}`;
}

/**
 * Claims the next eligible admin import job. Types are ordered lexicographically by enum
 * (pull_books before recommendations_recompute) so user-triggered imports stay ahead of cron.
 */
export async function claimNextAdminImportJob(
  types: AdminImportJobType[],
  lockPrefix: string,
) {
  const now = new Date();
  const candidate = await prisma.adminImportJob.findFirst({
    where: {
      type: { in: types },
      status: { in: [AdminImportJobStatus.queued, AdminImportJobStatus.running] },
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      finishedAt: null,
    },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
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
      lockOwner: lockOwnerId(lockPrefix),
      startedAt: now,
    },
  });
  if (updated.count === 0) return null;

  return prisma.adminImportJob.findUnique({
    where: { id: candidate.id },
  });
}
