-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'reader');

-- CreateEnum
CREATE TYPE "BookFormat" AS ENUM ('epub', 'physical', 'pdf', 'cbz', 'cbr', 'audiobook');

-- CreateEnum
CREATE TYPE "MetadataSource" AS ENUM ('manual', 'epub', 'openlibrary', 'calibre');

-- CreateEnum
CREATE TYPE "ShelfType" AS ENUM ('manual', 'dynamic', 'favorites', 'reading');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('not_started', 'reading', 'finished', 'abandoned');

-- CreateEnum
CREATE TYPE "AnnotationType" AS ENUM ('highlight', 'note', 'bookmark');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('light', 'dark', 'system');

-- CreateEnum
CREATE TYPE "ReaderTheme" AS ENUM ('light', 'dark', 'sepia');

-- CreateEnum
CREATE TYPE "ReaderFlow" AS ENUM ('paginated', 'scrolled');

-- CreateEnum
CREATE TYPE "LibraryView" AS ENUM ('grid', 'list');

-- CreateEnum
CREATE TYPE "DuplicateKind" AS ENUM ('hash', 'fuzzy');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('open', 'ignored', 'merged');

-- CreateEnum
CREATE TYPE "DuplicateAuditAction" AS ENUM ('ignored', 'merged');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('epub_ingest', 'calibre_import', 'book_purge', 'duplicate_ignore', 'duplicate_merge', 'mcp_tool_call');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'reader',
    "avatar_url" TEXT,
    "oidc_provider" VARCHAR(100),
    "oidc_sub" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "subtitle" VARCHAR(500),
    "authors" JSONB NOT NULL DEFAULT '[]',
    "isbn_10" VARCHAR(10),
    "isbn_13" VARCHAR(13),
    "publisher" VARCHAR(255),
    "publish_date" VARCHAR(50),
    "language" VARCHAR(10),
    "description" TEXT,
    "page_count" INTEGER,
    "subjects" JSONB NOT NULL DEFAULT '[]',
    "cover_url" TEXT,
    "format" "BookFormat" NOT NULL,
    "content_hash" VARCHAR(64),
    "open_library_id" VARCHAR(50),
    "metadata_source" "MetadataSource" NOT NULL,
    "added_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "search_vector" tsvector,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_files" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "filename" VARCHAR(500) NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_metadata_snapshots" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "epub_metadata" JSONB NOT NULL,
    "db_metadata" JSONB NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "book_metadata_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shelves" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "ShelfType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "icon" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shelf_rules" (
    "id" UUID NOT NULL,
    "shelf_id" UUID NOT NULL,
    "rules" JSONB NOT NULL,

    CONSTRAINT "shelf_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_shelves" (
    "book_id" UUID NOT NULL,
    "shelf_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "book_shelves_pkey" PRIMARY KEY ("book_id","shelf_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(7) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_tags" (
    "book_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "book_tags_pkey" PRIMARY KEY ("book_id","tag_id")
);

-- CreateTable
CREATE TABLE "user_book_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "current_cfi" TEXT,
    "current_page" INTEGER,
    "status" "ProgressStatus" NOT NULL DEFAULT 'not_started',
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "total_reading_seconds" INTEGER NOT NULL DEFAULT 0,
    "last_progress_client_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_book_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_annotations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "type" "AnnotationType" NOT NULL,
    "cfi_range" TEXT NOT NULL,
    "content" TEXT,
    "note" TEXT,
    "color" VARCHAR(7),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "theme" "ThemePreference" NOT NULL DEFAULT 'system',
    "reader_font_family" VARCHAR(100),
    "reader_font_size" INTEGER,
    "reader_line_height" DOUBLE PRECISION,
    "reader_margin" INTEGER,
    "reader_theme" "ReaderTheme",
    "reader_flow" "ReaderFlow",
    "library_view" "LibraryView",
    "books_per_page" INTEGER NOT NULL DEFAULT 24,
    "library_infinite_scroll" BOOLEAN NOT NULL DEFAULT false,
    "recommendations_collaborative_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recommendations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "computed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "hash" VARCHAR(255) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_pairs" (
    "id" UUID NOT NULL,
    "kind" "DuplicateKind" NOT NULL,
    "status" "DuplicateStatus" NOT NULL DEFAULT 'open',
    "book_id_a" UUID NOT NULL,
    "book_id_b" UUID NOT NULL,
    "score" DOUBLE PRECISION,
    "last_scanned_at" TIMESTAMPTZ(6) NOT NULL,
    "merged_into_book_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "duplicate_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_resolution_audits" (
    "id" UUID NOT NULL,
    "pair_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" "DuplicateAuditAction" NOT NULL,
    "primary_book_id" UUID,
    "absorbed_book_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "duplicate_resolution_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "actor_id" UUID NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "books_content_hash_idx" ON "books"("content_hash");

-- CreateIndex
CREATE INDEX "books_isbn_13_idx" ON "books"("isbn_13");

-- CreateIndex
CREATE INDEX "books_deleted_at_idx" ON "books"("deleted_at");

-- CreateIndex
CREATE INDEX "books_language_idx" ON "books"("language");

-- CreateIndex
CREATE INDEX "books_format_idx" ON "books"("format");

-- CreateIndex
CREATE INDEX "books_page_count_idx" ON "books"("page_count");

-- CreateIndex
CREATE INDEX "books_created_at_idx" ON "books"("created_at");

-- CreateIndex
CREATE INDEX "book_files_book_id_idx" ON "book_files"("book_id");

-- CreateIndex
CREATE INDEX "book_files_content_hash_idx" ON "book_files"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "book_metadata_snapshots_book_id_key" ON "book_metadata_snapshots"("book_id");

-- CreateIndex
CREATE INDEX "shelves_owner_id_idx" ON "shelves"("owner_id");

-- CreateIndex
CREATE INDEX "shelves_owner_id_type_idx" ON "shelves"("owner_id", "type");

-- CreateIndex
CREATE INDEX "shelves_owner_id_sort_order_idx" ON "shelves"("owner_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "shelf_rules_shelf_id_key" ON "shelf_rules"("shelf_id");

-- CreateIndex
CREATE INDEX "book_shelves_shelf_id_idx" ON "book_shelves"("shelf_id");

-- CreateIndex
CREATE INDEX "book_shelves_shelf_id_sort_order_idx" ON "book_shelves"("shelf_id", "sort_order");

-- CreateIndex
CREATE INDEX "book_shelves_shelf_id_added_at_idx" ON "book_shelves"("shelf_id", "added_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "book_tags_tag_id_idx" ON "book_tags"("tag_id");

-- CreateIndex
CREATE INDEX "user_book_progress_book_id_idx" ON "user_book_progress"("book_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_book_progress_user_id_book_id_key" ON "user_book_progress"("user_id", "book_id");

-- CreateIndex
CREATE INDEX "user_annotations_book_id_idx" ON "user_annotations"("book_id");

-- CreateIndex
CREATE INDEX "user_annotations_user_id_book_id_idx" ON "user_annotations"("user_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE INDEX "user_recommendations_book_id_idx" ON "user_recommendations"("book_id");

-- CreateIndex
CREATE INDEX "user_recommendations_user_id_dismissed_score_idx" ON "user_recommendations"("user_id", "dismissed", "score");

-- CreateIndex
CREATE UNIQUE INDEX "user_recommendations_user_id_book_id_key" ON "user_recommendations"("user_id", "book_id");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_hash_idx" ON "api_keys"("hash");

-- CreateIndex
CREATE INDEX "duplicate_pairs_status_idx" ON "duplicate_pairs"("status");

-- CreateIndex
CREATE INDEX "duplicate_pairs_kind_idx" ON "duplicate_pairs"("kind");

-- CreateIndex
CREATE INDEX "duplicate_pairs_last_scanned_at_idx" ON "duplicate_pairs"("last_scanned_at");

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_pairs_kind_book_id_a_book_id_b_key" ON "duplicate_pairs"("kind", "book_id_a", "book_id_b");

-- CreateIndex
CREATE INDEX "duplicate_resolution_audits_pair_id_idx" ON "duplicate_resolution_audits"("pair_id");

-- CreateIndex
CREATE INDEX "duplicate_resolution_audits_actor_id_idx" ON "duplicate_resolution_audits"("actor_id");

-- CreateIndex
CREATE INDEX "duplicate_resolution_audits_created_at_idx" ON "duplicate_resolution_audits"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- Partial unique indexes (active rows only; SPECS soft-delete uniqueness + phase1 integration tests)
CREATE UNIQUE INDEX "books_content_hash_active_key" ON "books" ("content_hash")
WHERE "deleted_at" IS NULL AND "content_hash" IS NOT NULL;

CREATE UNIQUE INDEX "books_isbn_13_active_key" ON "books" ("isbn_13")
WHERE "deleted_at" IS NULL AND "isbn_13" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_files" ADD CONSTRAINT "book_files_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_metadata_snapshots" ADD CONSTRAINT "book_metadata_snapshots_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelf_rules" ADD CONSTRAINT "shelf_rules_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_shelves" ADD CONSTRAINT "book_shelves_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_shelves" ADD CONSTRAINT "book_shelves_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_tags" ADD CONSTRAINT "book_tags_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_tags" ADD CONSTRAINT "book_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_book_progress" ADD CONSTRAINT "user_book_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_book_progress" ADD CONSTRAINT "user_book_progress_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_annotations" ADD CONSTRAINT "user_annotations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_annotations" ADD CONSTRAINT "user_annotations_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recommendations" ADD CONSTRAINT "user_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recommendations" ADD CONSTRAINT "user_recommendations_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_book_id_a_fkey" FOREIGN KEY ("book_id_a") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_book_id_b_fkey" FOREIGN KEY ("book_id_b") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_merged_into_book_id_fkey" FOREIGN KEY ("merged_into_book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_resolution_audits" ADD CONSTRAINT "duplicate_resolution_audits_pair_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "duplicate_pairs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_resolution_audits" ADD CONSTRAINT "duplicate_resolution_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_resolution_audits" ADD CONSTRAINT "duplicate_resolution_audits_primary_book_id_fkey" FOREIGN KEY ("primary_book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_resolution_audits" ADD CONSTRAINT "duplicate_resolution_audits_absorbed_book_id_fkey" FOREIGN KEY ("absorbed_book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Expression indexes (SPECS §15; not expressible as Prisma @@index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS books_search_vector_gin_idx ON books USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS books_title_gin_trgm_idx ON books USING GIN (title gin_trgm_ops);
