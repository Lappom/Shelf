import { COOC_MAX_FINISHED_PER_USER } from "./constants";

export type ProgressRowLite = {
  userId: string;
  bookId: string;
  status: string;
};

/**
 * Anonymous item–item signal: books frequently finished alongside the user's seeds
 * by *other* users (no neighbor identity exposed).
 */
export function buildCooccurrenceScores(args: {
  progressRows: ProgressRowLite[];
  targetUserId: string;
  seedBookIds: Set<string>;
}): Map<string, number> {
  const seeds = args.seedBookIds;
  if (seeds.size === 0) return new Map();

  const finishedByUser = new Map<string, Set<string>>();
  for (const row of args.progressRows) {
    if (row.status !== "finished") continue;
    let set = finishedByUser.get(row.userId);
    if (!set) {
      set = new Set();
      finishedByUser.set(row.userId, set);
    }
    if (set.size < COOC_MAX_FINISHED_PER_USER) {
      set.add(row.bookId);
    }
  }

  const raw = new Map<string, number>();

  for (const [uid, finished] of finishedByUser) {
    if (uid === args.targetUserId) continue;

    const overlap: string[] = [];
    for (const s of seeds) {
      if (finished.has(s)) overlap.push(s);
    }
    if (overlap.length === 0) continue;

    const inv = 1 / Math.sqrt(overlap.length);
    for (const s of overlap) {
      for (const b of finished) {
        if (b === s) continue;
        raw.set(b, (raw.get(b) ?? 0) + inv);
      }
    }
  }

  let max = 0;
  for (const v of raw.values()) {
    if (v > max) max = v;
  }
  if (max <= 0) return new Map();

  const out = new Map<string, number>();
  for (const [k, v] of raw) {
    out.set(k, Math.min(1, v / max));
  }
  return out;
}
