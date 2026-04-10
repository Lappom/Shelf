-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'pull_books';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "books_open_library_id_idx" ON "books" ("open_library_id");
