import { COLLAB_MIN_COMMON_BOOKS } from "./constants";

/** Cosine similarity on the intersection of book ids (both maps must be positive where used). */
export function userAffinityCosine(
  u: Map<string, number>,
  v: Map<string, number>,
): { sim: number; common: number } {
  let dot = 0;
  let nu = 0;
  let nv = 0;
  let common = 0;
  const smaller = u.size <= v.size ? u : v;
  const larger = u.size <= v.size ? v : u;
  for (const [bookId, au] of smaller) {
    const av = larger.get(bookId);
    if (av === undefined || au <= 0 || av <= 0) continue;
    common++;
    dot += au * av;
  }
  for (const val of u.values()) {
    if (val > 0) nu += val * val;
  }
  for (const val of v.values()) {
    if (val > 0) nv += val * val;
  }
  if (nu === 0 || nv === 0 || common < COLLAB_MIN_COMMON_BOOKS) return { sim: 0, common };
  return { sim: dot / (Math.sqrt(nu) * Math.sqrt(nv)), common };
}

/**
 * Collaborative score for book `bookId` from neighbors' affinities.
 * Returns value in [0, 1] when neighbors exist.
 */
export function collaborativeScoreForBook(
  bookId: string,
  targetAff: Map<string, number>,
  neighborAffinities: Array<{ userId: string; aff: Map<string, number>; sim: number }>,
): number {
  let num = 0;
  let den = 0;
  for (const n of neighborAffinities) {
    if (n.sim <= 0) continue;
    const a = n.aff.get(bookId);
    if (a === undefined || a <= 0) continue;
    // Skip books the target already "owns" with high affinity (should be excluded upstream)
    num += n.sim * Math.min(1, a);
    den += n.sim;
  }
  if (den <= 0) return 0;
  return Math.min(1, num / den);
}

export function findNeighbors(
  targetUserId: string,
  targetAff: Map<string, number>,
  allUsers: Map<string, Map<string, number>>,
  maxNeighbors: number,
): Array<{ userId: string; aff: Map<string, number>; sim: number }> {
  const out: Array<{ userId: string; aff: Map<string, number>; sim: number; common: number }> = [];
  for (const [uid, aff] of allUsers) {
    if (uid === targetUserId) continue;
    const { sim, common } = userAffinityCosine(targetAff, aff);
    if (common < COLLAB_MIN_COMMON_BOOKS || sim <= 0) continue;
    out.push({ userId: uid, aff, sim, common });
  }
  out.sort((a, b) => b.sim - a.sim);
  return out.slice(0, maxNeighbors).map(({ userId, aff, sim }) => ({ userId, aff, sim }));
}
