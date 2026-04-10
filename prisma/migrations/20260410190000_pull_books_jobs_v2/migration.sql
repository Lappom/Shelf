-- Phase 28 Pull books V2 job queue
CREATE TYPE "AdminImportJobType" AS ENUM ('pull_books');

CREATE TYPE "AdminImportJobStatus" AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'dead_letter'
);

ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'pull_books_job_create';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'pull_books_job_cancel';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'pull_books_job_retry';

CREATE TABLE "admin_import_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "AdminImportJobType" NOT NULL,
  "status" "AdminImportJobStatus" NOT NULL DEFAULT 'queued',
  "params" JSONB NOT NULL,
  "processed_candidates" INTEGER NOT NULL DEFAULT 0,
  "created_count" INTEGER NOT NULL DEFAULT 0,
  "updated_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "last_cursor" TEXT,
  "next_run_at" TIMESTAMPTZ(6),
  "locked_at" TIMESTAMPTZ(6),
  "lock_owner" VARCHAR(100),
  "cancel_requested_at" TIMESTAMPTZ(6),
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "admin_import_job_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "job_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "authors" JSONB NOT NULL DEFAULT '[]',
  "open_library_id" VARCHAR(50),
  "isbn_13" VARCHAR(13),
  "error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_import_job_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_import_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "admin_import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "admin_import_jobs_type_status_next_run_at_idx"
  ON "admin_import_jobs"("type", "status", "next_run_at");
CREATE INDEX "admin_import_jobs_created_at_idx"
  ON "admin_import_jobs"("created_at");
CREATE INDEX "admin_import_jobs_created_by_id_created_at_idx"
  ON "admin_import_jobs"("created_by_id", "created_at");
CREATE INDEX "admin_import_jobs_status_updated_at_idx"
  ON "admin_import_jobs"("status", "updated_at");
CREATE INDEX "admin_import_job_items_job_id_created_at_idx"
  ON "admin_import_job_items"("job_id", "created_at");
