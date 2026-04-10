-- CreateEnum
CREATE TYPE "ExternalCatalogProvider" AS ENUM ('openlibrary', 'googlebooks');

-- AlterTable
ALTER TABLE "books"
ADD COLUMN "external_catalog_provider" "ExternalCatalogProvider",
ADD COLUMN "external_catalog_id" VARCHAR(255),
ADD COLUMN "external_catalog_query" VARCHAR(200);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "books_external_catalog_provider_external_catalog_id_idx"
ON "books" ("external_catalog_provider", "external_catalog_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "books_external_catalog_active_key"
ON "books" ("external_catalog_provider", "external_catalog_id")
WHERE "deleted_at" IS NULL AND "external_catalog_provider" IS NOT NULL AND "external_catalog_id" IS NOT NULL;
