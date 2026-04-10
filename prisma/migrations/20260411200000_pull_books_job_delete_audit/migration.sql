-- Admin audit action for pull-books job deletion
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'pull_books_job_delete';
