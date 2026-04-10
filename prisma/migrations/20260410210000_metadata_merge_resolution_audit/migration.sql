-- Metadata merge V2: admin resolution audit + AdminAuditAction variants

ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'metadata_merge_preview';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'metadata_merge_commit';

CREATE TABLE "metadata_merge_resolution_audits" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "snapshot_synced_at_iso" VARCHAR(40),
    "input" JSONB NOT NULL DEFAULT '{}',
    "field_decisions" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB NOT NULL DEFAULT '{}',
    "writeback" BOOLEAN NOT NULL DEFAULT false,
    "old_content_hash" VARCHAR(64),
    "new_content_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metadata_merge_resolution_audits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "metadata_merge_resolution_audits" ADD CONSTRAINT "metadata_merge_resolution_audits_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "metadata_merge_resolution_audits" ADD CONSTRAINT "metadata_merge_resolution_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "metadata_merge_resolution_audits_book_id_created_at_idx" ON "metadata_merge_resolution_audits"("book_id", "created_at");

CREATE INDEX "metadata_merge_resolution_audits_actor_id_created_at_idx" ON "metadata_merge_resolution_audits"("actor_id", "created_at");
