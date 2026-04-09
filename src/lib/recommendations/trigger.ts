import { recomputeRecommendationsForUser } from "./recomputeForUser";

/** Fire-and-forget background recompute (invalidation hooks). */
export function scheduleRecommendationsRecompute(userId: string): void {
  void recomputeRecommendationsForUser(userId).catch(() => undefined);
}
