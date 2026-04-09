-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN "name" VARCHAR(100) NOT NULL DEFAULT 'Unnamed';

-- CreateIndex
CREATE INDEX "api_keys_hash_idx" ON "api_keys"("hash");
