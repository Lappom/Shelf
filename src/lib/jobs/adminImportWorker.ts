import { AdminImportJobType } from "@prisma/client";

import { claimNextAdminImportJob } from "@/lib/jobs/adminImportClaim";
import { runRecommendationsRecomputeJob } from "@/lib/admin/recommendationsRecomputeJobs";

let workerRunning = false;

const SUPPORTED_JOB_TYPES = [
  AdminImportJobType.pull_books,
  AdminImportJobType.recommendations_recompute,
] as const;

export type AdminImportWorkerOptions = {
  /** When set, stop after this many job chunks (one run of pull-books or recommendations). */
  maxChunks?: number;
};

/**
 * Drains the admin import queue. Uses dynamic import for pull-books to avoid a static import cycle.
 */
export async function triggerAdminImportWorker(opts?: AdminImportWorkerOptions): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  const maxChunks = opts?.maxChunks;
  let chunks = 0;
  try {
    for (;;) {
      if (maxChunks !== undefined && chunks >= maxChunks) break;
      const job = await claimNextAdminImportJob([...SUPPORTED_JOB_TYPES], "admin-import-worker");
      if (!job) break;

      if (job.type === AdminImportJobType.pull_books) {
        const { runPullBooksJob } = await import("@/lib/admin/pullBooksJobs");
        await runPullBooksJob(job.id);
      } else if (job.type === AdminImportJobType.recommendations_recompute) {
        await runRecommendationsRecomputeJob(job.id);
      }

      chunks += 1;
    }
  } finally {
    workerRunning = false;
  }
}
