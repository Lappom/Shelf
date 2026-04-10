import type { BookFeatures, RecommendationReason } from "./types";

export function reasonPopular(): RecommendationReason {
  return {
    code: "popular",
    text: "Populaire auprès des lecteurs",
  };
}

export function reasonRecent(): RecommendationReason {
  return {
    code: "recent",
    text: "Récemment ajouté à la bibliothèque",
  };
}

export function reasonSameAuthor(author: string): RecommendationReason {
  return {
    code: "same_author",
    text: `Même auteur : ${author}`,
  };
}

export function reasonSimilarSubject(): RecommendationReason {
  return {
    code: "similar_subject",
    text: "Sujet proche de vos lectures",
  };
}

export function reasonSimilarTags(): RecommendationReason {
  return {
    code: "similar_tags",
    text: "Tags similaires à vos livres",
  };
}

export function reasonNeighbor(): RecommendationReason {
  return {
    code: "neighbor_user",
    text: "Apprécié par des lecteurs aux goûts proches",
  };
}

export function reasonReadTogether(): RecommendationReason {
  return {
    code: "read_together",
    text: "Souvent lu par des lecteurs qui ont aimé les mêmes livres",
  };
}

export function reasonLikedBook(title: string): RecommendationReason {
  return {
    code: "because_liked",
    text: `Parce que vous avez aimé « ${title} »`,
  };
}

export function pickPrimaryReason(reasons: RecommendationReason[]): RecommendationReason | null {
  const order = [
    "because_liked",
    "same_author",
    "similar_subject",
    "neighbor_user",
    "read_together",
    "similar_tags",
    "popular",
    "recent",
  ];
  for (const code of order) {
    const r = reasons.find((x) => x.code === code);
    if (r) return r;
  }
  return reasons[0] ?? null;
}

export function bestWeightedSeed(
  candidate: BookFeatures,
  seeds: BookFeatures[],
  seedWeights: Map<string, number>,
  simFn: (s: BookFeatures, c: BookFeatures) => number,
): { seed: BookFeatures; sim: number } | null {
  let top: { seed: BookFeatures; sim: number; weighted: number } | null = null;
  for (const s of seeds) {
    const w = seedWeights.get(s.id) ?? 0;
    if (w <= 0) continue;
    const sim = simFn(s, candidate);
    const weighted = sim * w;
    if (!top || weighted > top.weighted) {
      top = { seed: s, sim, weighted };
    }
  }
  return top ? { seed: top.seed, sim: top.sim } : null;
}
