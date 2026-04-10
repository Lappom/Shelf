import { prisma } from "@/lib/db/prisma";

import {
  applyAnchorAdjustments,
  dominantLanguageFromSeeds,
  fileAvailabilityBonus,
  languageScoreMultiplier,
  maxContentSimilarityToAnchors,
  noveltyRecencyBoost,
} from "./anchorSignals";
import { TOP_STORED, W_FINAL_POPULARITY, W_FINAL_RECENCY } from "./constants";
import {
  applyAuthorSubjectDiversity,
  finalScore,
  popularityScore,
  recencyBonus,
} from "./aggregate";
import { bookSubjectTfidf, buildSubjectIdf, jsonAuthorsToStrings, subjectsToTerms } from "./corpus";
import { buildCooccurrenceScores } from "./cooccurrence";
import { collaborativeScoreForBook, findNeighbors } from "./collaborative";
import type { BookFeatures } from "./types";
import { authorOverlap, contentSimilarity, sparseCosine, tagJaccard } from "./similarity";
import { mergeExplicitFeedbackIntoExcluded } from "./mergeExplicitFeedbackIntoExcluded";
import {
  bestWeightedSeed,
  reasonLikedBook,
  reasonNeighbor,
  reasonPopular,
  reasonReadTogether,
  reasonRecent,
  reasonSameAuthor,
  reasonSimilarSubject,
  reasonSimilarTags,
} from "./reasons";

const EPS = 1e-6;
const MAX_NEIGHBORS = 40;

function readingTimeBoost(seconds: number): number {
  const hours = seconds / 3600;
  return Math.min(hours, 10) * 0.8;
}

export function computeBookAffinity(args: {
  status: string;
  progress: number;
  totalReadingSeconds: number;
}): number {
  let a = 0;
  if (args.status === "finished") a += 10;
  else if (args.status === "abandoned") a -= 8;
  else if (args.status === "reading") {
    a += 2;
    a += readingTimeBoost(args.totalReadingSeconds);
  }
  if (typeof args.progress === "number" && args.progress > 0.5) a += 1;
  return a;
}

function buildUserAffinityFromRows(args: {
  userId: string;
  progressRows: Array<{
    userId: string;
    bookId: string;
    status: string;
    progress: number;
    totalReadingSeconds: number;
  }>;
  shelfRows: Array<{ ownerId: string; bookId: string; shelfType: string }>;
  annotationCounts: Array<{ userId: string; bookId: string; n: number }>;
}): Map<string, number> {
  const m = new Map<string, number>();
  const { userId } = args;

  for (const p of args.progressRows) {
    if (p.userId !== userId) continue;
    const d = computeBookAffinity({
      status: p.status,
      progress: p.progress,
      totalReadingSeconds: p.totalReadingSeconds,
    });
    m.set(p.bookId, (m.get(p.bookId) ?? 0) + d);
  }

  for (const s of args.shelfRows) {
    if (s.ownerId !== userId) continue;
    if (s.shelfType === "favorites") {
      m.set(s.bookId, (m.get(s.bookId) ?? 0) + 8);
    } else if (s.shelfType === "manual") {
      m.set(s.bookId, (m.get(s.bookId) ?? 0) + 2);
    }
  }

  for (const a of args.annotationCounts) {
    if (a.userId !== userId) continue;
    const add = Math.min(a.n * 1.5, 6);
    m.set(a.bookId, (m.get(a.bookId) ?? 0) + add);
  }

  return m;
}

function positiveVector(aff: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of aff) {
    if (v > EPS) out.set(k, v);
  }
  return out;
}

export async function recomputeRecommendationsForUser(userId: string): Promise<void> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { recommendationsCollaborativeEnabled: true },
  });
  const collaborativeEnabled = pref?.recommendationsCollaborativeEnabled ?? true;

  const [
    dismissed,
    feedbackRows,
    booksRaw,
    progressAll,
    shelfLinks,
    favoriteRows,
    annGroups,
    finishedCounts,
    totalUsers,
    progressTarget,
  ] = await Promise.all([
    prisma.userRecommendation.findMany({
      where: { userId, dismissed: true },
      select: { bookId: true },
    }),
    prisma.userRecommendationFeedback.findMany({
      where: { userId },
      select: { bookId: true, kind: true },
    }),
    prisma.book.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        authors: true,
        subjects: true,
        language: true,
        publisher: true,
        pageCount: true,
        createdAt: true,
        tags: { select: { tagId: true } },
        _count: { select: { files: true } },
      },
    }),
    prisma.userBookProgress.findMany({
      select: {
        userId: true,
        bookId: true,
        status: true,
        progress: true,
        totalReadingSeconds: true,
      },
    }),
    prisma.bookShelf.findMany({
      where: { shelf: { type: { in: ["manual", "favorites"] } } },
      select: { bookId: true, shelf: { select: { ownerId: true, type: true } } },
    }),
    prisma.bookShelf.findMany({
      where: { shelf: { ownerId: userId, type: "favorites" } },
      select: { bookId: true },
    }),
    prisma.userAnnotation.groupBy({
      by: ["userId", "bookId"],
      _count: true,
    }),
    prisma.userBookProgress.groupBy({
      by: ["bookId"],
      where: { status: "finished" },
      _count: true,
    }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.userBookProgress.findMany({
      where: { userId },
      select: { bookId: true, status: true },
    }),
  ]);

  const dismissedSet = new Set(dismissed.map((d) => d.bookId));
  const likeAnchorIds = feedbackRows.filter((f) => f.kind === "like").map((f) => f.bookId);
  const dislikeAnchorIds = feedbackRows.filter((f) => f.kind === "dislike").map((f) => f.bookId);
  const negativeAnchorIds = [...new Set([...dismissedSet, ...dislikeAnchorIds])];

  const shelfRows = shelfLinks.map((l) => ({
    ownerId: l.shelf.ownerId,
    bookId: l.bookId,
    shelfType: l.shelf.type,
  }));

  const annotationCounts = annGroups.map((g) => ({
    userId: g.userId,
    bookId: g.bookId,
    n: g._count,
  }));

  const progressRows = progressAll.map((p) => ({
    userId: p.userId,
    bookId: p.bookId,
    status: p.status,
    progress: p.progress,
    totalReadingSeconds: p.totalReadingSeconds,
  }));

  const finishedByBook = new Map<string, number>();
  for (const f of finishedCounts) {
    finishedByBook.set(f.bookId, f._count);
  }

  const bookFeatures: BookFeatures[] = booksRaw.map((b) => ({
    id: b.id,
    title: b.title,
    authors: jsonAuthorsToStrings(b.authors),
    subjectTerms: subjectsToTerms(b.subjects),
    tagIds: b.tags.map((t) => t.tagId),
    language: b.language,
    publisher: b.publisher,
    pageCount: b.pageCount,
    createdAt: b.createdAt,
    fileCount: b._count.files,
  }));

  const bookById = new Map(bookFeatures.map((b) => [b.id, b]));
  const idf = buildSubjectIdf(bookFeatures);
  const tfidfByBook = new Map<string, Map<string, number>>();
  for (const b of bookFeatures) {
    tfidfByBook.set(b.id, bookSubjectTfidf(b, idf));
  }

  const simFn = (s: BookFeatures, c: BookFeatures) =>
    contentSimilarity(s, c, tfidfByBook.get(s.id)!, tfidfByBook.get(c.id)!);

  const targetAff = buildUserAffinityFromRows({
    userId,
    progressRows,
    shelfRows,
    annotationCounts,
  });

  const excluded = new Set<string>();
  for (const p of progressTarget) {
    if (p.status === "finished" || p.status === "abandoned") excluded.add(p.bookId);
  }
  for (const id of dismissedSet) excluded.add(id);
  for (const f of favoriteRows) excluded.add(f.bookId);
  mergeExplicitFeedbackIntoExcluded(excluded, feedbackRows);

  const seedWeights = new Map<string, number>();
  for (const [bid, w] of targetAff) {
    if (w > EPS) seedWeights.set(bid, w);
  }

  const seeds = bookFeatures
    .filter((b) => (seedWeights.get(b.id) ?? 0) > 0.5)
    .sort((a, b) => (seedWeights.get(b.id) ?? 0) - (seedWeights.get(a.id) ?? 0))
    .slice(0, 25);

  const seedIdSet = new Set(seeds.map((s) => s.id));
  const coocByBook = buildCooccurrenceScores({
    progressRows,
    targetUserId: userId,
    seedBookIds: seedIdSet,
  });
  const dominantLang = dominantLanguageFromSeeds(seeds);

  const userIds = new Set<string>();
  for (const p of progressRows) userIds.add(p.userId);
  for (const s of shelfRows) userIds.add(s.ownerId);
  for (const a of annotationCounts) userIds.add(a.userId);

  const allUserAff = new Map<string, Map<string, number>>();
  for (const uid of userIds) {
    allUserAff.set(
      uid,
      positiveVector(
        buildUserAffinityFromRows({
          userId: uid,
          progressRows,
          shelfRows,
          annotationCounts,
        }),
      ),
    );
  }

  const targetPos = allUserAff.get(userId) ?? new Map();
  const neighbors = collaborativeEnabled
    ? findNeighbors(userId, targetPos, allUserAff, MAX_NEIGHBORS)
    : [];

  const now = new Date();
  const candidates = bookFeatures.filter((b) => !excluded.has(b.id));

  const coldStart = seeds.length === 0;

  type Row = {
    bookId: string;
    score: number;
    content: number;
    collab: number;
    cooc: number;
    popularity: number;
    recency: number;
    reasons: Array<{ code: string; text: string }>;
  };

  const scored: Row[] = [];

  for (const c of candidates) {
    const pop = popularityScore(finishedByBook.get(c.id) ?? 0, totalUsers);
    const rec = recencyBonus(c.createdAt, now);

    let content = 0;
    if (!coldStart && seeds.length > 0) {
      let num = 0;
      let den = 0;
      for (const s of seeds) {
        const w = seedWeights.get(s.id) ?? 0;
        if (w <= EPS) continue;
        num += w * simFn(s, c);
        den += w;
      }
      content = den > 0 ? num / den : 0;
    } else {
      content = 0;
    }

    const collab =
      collaborativeEnabled && neighbors.length > 0
        ? collaborativeScoreForBook(c.id, targetPos, neighbors)
        : 0;

    const coocSc = collaborativeEnabled ? (coocByBook.get(c.id) ?? 0) : 0;

    const reasons: Array<{ code: string; text: string }> = [];

    if (!coldStart && seeds.length > 0) {
      const best = bestWeightedSeed(c, seeds, seedWeights, simFn);
      if (best && best.sim > 0.15) {
        reasons.push(reasonLikedBook(best.seed.title));
      }
      if (best && best.sim > 0.1) {
        const ao = authorOverlap(best.seed, c);
        if (ao >= 0.34) {
          const a0 = best.seed.authors[0]?.trim();
          if (a0) reasons.push(reasonSameAuthor(a0));
        }
        if (sparseCosine(tfidfByBook.get(best.seed.id)!, tfidfByBook.get(c.id)!) > 0.2) {
          reasons.push(reasonSimilarSubject());
        }
        if (tagJaccard(best.seed, c) >= 0.25) {
          reasons.push(reasonSimilarTags());
        }
      }
    }

    if (!coldStart && collab >= 0.08) {
      reasons.push(reasonNeighbor());
    }
    if (!coldStart && coocSc >= 0.12) {
      reasons.push(reasonReadTogether());
    }
    if (pop >= 0.05) {
      reasons.push(reasonPopular());
    }
    if (rec >= 0.35) {
      reasons.push(reasonRecent());
    }

    if (reasons.length === 0) {
      reasons.push(reasonPopular());
    }

    const wPopRec = W_FINAL_POPULARITY + W_FINAL_RECENCY;
    let rawFinal = coldStart
      ? (W_FINAL_POPULARITY / wPopRec) * pop + (W_FINAL_RECENCY / wPopRec) * rec
      : finalScore(content, collab, coocSc, pop, rec, collaborativeEnabled);

    const finishedReaders = finishedByBook.get(c.id) ?? 0;
    rawFinal += noveltyRecencyBoost(finishedReaders, rec);
    rawFinal *= languageScoreMultiplier(c.language, dominantLang);
    rawFinal += fileAvailabilityBonus(c.fileCount);

    const maxNeg = maxContentSimilarityToAnchors(c, negativeAnchorIds, bookById, simFn);
    const maxPos = maxContentSimilarityToAnchors(c, likeAnchorIds, bookById, simFn);
    rawFinal = applyAnchorAdjustments({
      baseScore: rawFinal,
      maxNegSimilarity: maxNeg,
      maxPosSimilarity: maxPos,
    });

    const score = Math.max(0, Math.min(1, rawFinal));

    scored.push({
      bookId: c.id,
      score,
      content,
      collab,
      cooc: coocSc,
      popularity: pop,
      recency: rec,
      reasons: dedupeReasons(reasons),
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const forDiversity = scored.slice(0, 120).map((r) => ({
    bookId: r.bookId,
    score: r.score,
    content: r.content,
    collab: r.collab,
    popularity: r.popularity,
    recency: r.recency,
  }));

  const diversified = applyAuthorSubjectDiversity(forDiversity, bookById, tfidfByBook, TOP_STORED);
  const top = diversified.slice(0, TOP_STORED);

  const scoreById = new Map(scored.map((r) => [r.bookId, r]));

  await prisma.$transaction(async (tx) => {
    await tx.userRecommendation.deleteMany({
      where: { userId, dismissed: false },
    });

    const computedAt = new Date();
    for (const row of top) {
      const meta = scoreById.get(row.bookId);
      const reasons = meta?.reasons ?? [{ code: "popular", text: "Populaire auprès des lecteurs" }];
      await tx.userRecommendation.create({
        data: {
          userId,
          bookId: row.bookId,
          score: Math.max(0, Math.min(1, row.score)),
          reasons,
          seen: false,
          dismissed: false,
          computedAt,
        },
      });
    }
  });
}

function dedupeReasons(r: Array<{ code: string; text: string }>) {
  const seen = new Set<string>();
  const out: Array<{ code: string; text: string }> = [];
  for (const x of r) {
    if (seen.has(x.code)) continue;
    seen.add(x.code);
    out.push(x);
  }
  return out.slice(0, 5);
}
