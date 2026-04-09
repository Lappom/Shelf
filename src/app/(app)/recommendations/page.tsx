import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { encodeRecoCursor } from "@/lib/recommendations/recoCursor";
import { loadRecommendationsPage } from "@/lib/recommendations/loadRecommendationsPage";

import { RecommendationsPageClient } from "./RecommendationsPageClient";

export default async function RecommendationsPage() {
  const user = await requireUser();
  const userId = user.id;
  if (!userId) throw new Error("User id is missing");

  const [pref, first] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId },
      select: { recommendationsCollaborativeEnabled: true },
    }),
    loadRecommendationsPage({
      userId,
      limit: 10,
      reasonCode: null,
      cursor: null,
    }),
  ]);

  return (
    <RecommendationsPageClient
      initialItems={first.rows}
      initialNextCursor={first.nextCursor ? encodeRecoCursor(first.nextCursor) : null}
      collaborativeEnabled={pref?.recommendationsCollaborativeEnabled ?? true}
    />
  );
}
