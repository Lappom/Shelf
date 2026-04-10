import { AdminImportJobStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import { computeChunkJobBackoffMs } from "./chunkJobBackoff";

export async function markAdminImportChunkFailure(
  jobId: string,
  attempts: number,
  maxAttempts: number,
  errorMessage: string,
) {
  const terminal = attempts >= maxAttempts;
  const nextRunAt = terminal ? null : new Date(Date.now() + computeChunkJobBackoffMs(attempts));
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
