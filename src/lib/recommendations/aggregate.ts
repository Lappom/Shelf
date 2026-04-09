import type { BookFeatures } from "./types";
import {
  SAME_AUTHOR_PENALTY,
  W_FINAL_COLLAB,
  W_FINAL_CONTENT,
  W_FINAL_POPULARITY,
  W_FINAL_RECENCY,
} from "./constants";
import { normalizeAuthorSet } from "./similarity";

export type ScoredCandidate = {
  bookId: string;
  score: number;
  content: number;
  collab: number;
  popularity: number;
  recency: number;
};

/**
 * Recency bonus in [0, 1]: books created in the last ~120 days score higher.
 */
export function recencyBonus(createdAt: Date, now: Date): number {
  const ms = now.getTime() - createdAt.getTime();
  const days = ms / 86_400_000;
  if (days <= 0) return 1;
  if (days >= 365) return 0;
  return Math.max(0, 1 - days / 365);
}

/**
 * Popularity in [0, 1]: finished readers / total registered users (SPECS §16.4).
 */
export function popularityScore(finishedReaders: number, totalUsers: number): number {
  const d = Math.max(1, totalUsers);
  return Math.min(1, finishedReaders / d);
}

/**
 * Greedy re-ranking: penalize candidates whose primary author overlaps with already picked authors.
 */
export function applyAuthorDiversity(
  sorted: ScoredCandidate[],
  bookById: Map<string, BookFeatures>,
  topK: number,
): ScoredCandidate[] {
  const picked: ScoredCandidate[] = [];
  const authorCounts = new Map<string, number>();

  const remaining = [...sorted];

  while (picked.length < topK && remaining.length) {
    let bestIdx = 0;
    let bestAdj = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]!;
      const book = bookById.get(c.bookId);
      let penalty = 0;
      if (book) {
        for (const a of normalizeAuthorSet(book.authors)) {
          penalty += (authorCounts.get(a) ?? 0) * SAME_AUTHOR_PENALTY;
        }
      }
      const adj = c.score - penalty;
      if (adj > bestAdj) {
        bestAdj = adj;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    picked.push(next);
    const book = bookById.get(next.bookId);
    if (book) {
      for (const a of normalizeAuthorSet(book.authors)) {
        authorCounts.set(a, (authorCounts.get(a) ?? 0) + 1);
      }
    }
  }

  return picked;
}

/** Weighted blend per SPECS §16.4 (collab may be 0 when disabled). */
export function finalScore(
  content: number,
  collab: number,
  popularity: number,
  recency: number,
  collaborativeEnabled: boolean,
): number {
  const wCollab = collaborativeEnabled ? W_FINAL_COLLAB : 0;
  const base = W_FINAL_CONTENT + wCollab + W_FINAL_POPULARITY + W_FINAL_RECENCY;
  return (
    (W_FINAL_CONTENT / base) * content +
    (wCollab / base) * collab +
    (W_FINAL_POPULARITY / base) * popularity +
    (W_FINAL_RECENCY / base) * recency
  );
}
