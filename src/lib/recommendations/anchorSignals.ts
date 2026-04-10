import {
  ANCHOR_NEGATIVE_PENALTY,
  ANCHOR_POSITIVE_BOOST,
  LANGUAGE_MISMATCH_FACTOR,
  NOVELTY_FINISHED_THRESHOLD,
  W_HAS_FILE,
  W_NOVELTY_RECENCY,
} from "./constants";
import type { BookFeatures } from "./types";

export function dominantLanguageFromSeeds(seeds: BookFeatures[]): string | null {
  const counts = new Map<string, number>();
  for (const s of seeds) {
    const L = (s.language ?? "").trim().toLowerCase();
    if (!L) continue;
    counts.set(L, (counts.get(L) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, v] of counts) {
    if (v > bestN) {
      bestN = v;
      best = k;
    }
  }
  return best;
}

/**
 * Soft gate: unknown candidate language keeps neutral multiplier.
 */
export function languageScoreMultiplier(
  candidateLang: string | null,
  dominantLang: string | null,
): number {
  if (!dominantLang) return 1;
  const c = (candidateLang ?? "").trim().toLowerCase();
  if (!c) return 1;
  return c === dominantLang ? 1 : LANGUAGE_MISMATCH_FACTOR;
}

export function maxContentSimilarityToAnchors(
  candidate: BookFeatures,
  anchorBookIds: string[],
  bookById: Map<string, BookFeatures>,
  simFn: (a: BookFeatures, b: BookFeatures) => number,
): number {
  let m = 0;
  for (const id of anchorBookIds) {
    const a = bookById.get(id);
    if (!a) continue;
    m = Math.max(m, simFn(a, candidate));
  }
  return m;
}

/** Additive boost for low global finished count (exploration). */
export function noveltyRecencyBoost(finishedReaders: number, recency: number): number {
  if (finishedReaders > NOVELTY_FINISHED_THRESHOLD) return 0;
  return W_NOVELTY_RECENCY * recency;
}

export function fileAvailabilityBonus(fileCount: number): number {
  return fileCount > 0 ? W_HAS_FILE : 0;
}

export function applyAnchorAdjustments(args: {
  baseScore: number;
  maxNegSimilarity: number;
  maxPosSimilarity: number;
}): number {
  let s = args.baseScore;
  s -= ANCHOR_NEGATIVE_PENALTY * args.maxNegSimilarity;
  s += ANCHOR_POSITIVE_BOOST * args.maxPosSimilarity;
  return s;
}
