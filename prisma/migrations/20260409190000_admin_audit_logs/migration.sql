-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('epub_ingest', 'calibre_import', 'book_purge', 'duplicate_ignore', 'duplicate_merge', 'mcp_tool_call');

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action" "AdminAuditAction" NOT NULL,
    "actor_id" UUID NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
