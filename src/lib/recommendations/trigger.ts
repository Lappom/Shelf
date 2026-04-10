import { logShelfEvent } from "@/lib/observability/structuredLog";

import { recomputeRecommendationsForUser } from "./recomputeForUser";

/**
 * Fire-and-forget background recompute (invalidation hooks).
 * Not the same queue as cron `recommendations_recompute` jobs (see SPECS).
 */
export function scheduleRecommendationsRecompute(userId: string): void {
  logShelfEvent("recommendations_recompute_inline", { reason: "invalidation_hook" });
  void recomputeRecommendationsForUser(userId).catch(() => undefined);
}
