-- AlterTable
ALTER TABLE "user_book_progress" ADD COLUMN     "total_reading_seconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_progress_client_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "recommendations_collaborative_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "user_recommendations_user_id_dismissed_score_idx" ON "user_recommendations"("user_id", "dismissed", "score");
