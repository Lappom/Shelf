-- CreateEnum
CREATE TYPE "RecommendationFeedbackKind" AS ENUM ('like', 'dislike');

-- CreateEnum
CREATE TYPE "RecommendationAnalyticsEventType" AS ENUM ('impression', 'click', 'dismiss', 'like', 'dislike');

-- CreateEnum
CREATE TYPE "RecommendationAnalyticsSource" AS ENUM ('carousel', 'page', 'mcp');

-- CreateTable
CREATE TABLE "user_recommendation_feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "kind" "RecommendationFeedbackKind" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_recommendation_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_analytics_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "event" "RecommendationAnalyticsEventType" NOT NULL,
    "source" "RecommendationAnalyticsSource" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_recommendation_feedback_user_id_book_id_key" ON "user_recommendation_feedback"("user_id", "book_id");

-- CreateIndex
CREATE INDEX "user_recommendation_feedback_user_id_idx" ON "user_recommendation_feedback"("user_id");

-- CreateIndex
CREATE INDEX "recommendation_analytics_events_user_id_created_at_idx" ON "recommendation_analytics_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "recommendation_analytics_events_event_created_at_idx" ON "recommendation_analytics_events"("event", "created_at");

-- AddForeignKey
ALTER TABLE "user_recommendation_feedback" ADD CONSTRAINT "user_recommendation_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recommendation_feedback" ADD CONSTRAINT "user_recommendation_feedback_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_analytics_events" ADD CONSTRAINT "recommendation_analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_analytics_events" ADD CONSTRAINT "recommendation_analytics_events_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
