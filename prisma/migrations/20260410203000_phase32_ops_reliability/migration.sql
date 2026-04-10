-- Phase 32: recommendations job type, nullable job creator (cron), idempotency keys

ALTER TYPE "AdminImportJobType" ADD VALUE 'recommendations_recompute';

ALTER TABLE "admin_import_jobs" ALTER COLUMN "created_by_id" DROP NOT NULL;

CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key_hash" VARCHAR(64) NOT NULL,
    "route" VARCHAR(200) NOT NULL,
    "user_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_keys_key_hash_route_user_id_key" ON "idempotency_keys"("key_hash", "route", "user_id");

CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
