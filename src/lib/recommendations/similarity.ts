import type { BookFeatures } from "./types";
import { W_AUTHOR, W_LANGUAGE, W_PAGES, W_PUBLISHER, W_SUBJECT, W_TAG } from "./constants";

export function normalizeAuthorSet(authors: string[]): Set<string> {
  const s = new Set<string>();
  for (const a of authors) {
    const t = a.trim().toLowerCase();
    if (t) s.add(t);
  }
  return s;
}

export function authorOverlap(a: BookFeatures, b: BookFeatures): number {
  const A = normalizeAuthorSet(a.authors);
  const B = normalizeAuthorSet(b.authors);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter++;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function tagJaccard(a: BookFeatures, b: BookFeatures): number {
  const A = new Set(a.tagIds);
  const B = new Set(b.tagIds);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter++;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function sameLanguage(a: BookFeatures, b: BookFeatures): number {
  const la = (a.language ?? "").trim().toLowerCase();
  const lb = (b.language ?? "").trim().toLowerCase();
  if (!la || !lb) return 0;
  return la === lb ? 1 : 0;
}

export function samePublisher(a: BookFeatures, b: BookFeatures): number {
  const pa = (a.publisher ?? "").trim().toLowerCase();
  const pb = (b.publisher ?? "").trim().toLowerCase();
  if (!pa || !pb) return 0;
  return pa === pb ? 1 : 0;
}

export function pageProximity(a: BookFeatures, b: BookFeatures): number {
  const pa = a.pageCount;
  const pb = b.pageCount;
  if (pa == null || pb == null || pa <= 0 || pb <= 0) return 0;
  const maxP = Math.max(pa, pb);
  const diff = Math.abs(pa - pb);
  return Math.max(0, 1 - Math.min(1, diff / maxP));
}

/** Cosine similarity on sparse TF-IDF vectors (same term index). */
export function sparseCosine(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of vecA.values()) na += v * v;
  for (const v of vecB.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  const smaller = vecA.size <= vecB.size ? vecA : vecB;
  const larger = vecA.size <= vecB.size ? vecB : vecA;
  for (const [term, va] of smaller) {
    const vb = larger.get(term);
    if (vb !== undefined) dot += va * vb;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function contentSimilarity(
  a: BookFeatures,
  b: BookFeatures,
  tfidfA: Map<string, number>,
  tfidfB: Map<string, number>,
): number {
  const subj = sparseCosine(tfidfA, tfidfB);
  return (
    W_AUTHOR * authorOverlap(a, b) +
    W_SUBJECT * subj +
    W_TAG * tagJaccard(a, b) +
    W_LANGUAGE * sameLanguage(a, b) +
    W_PUBLISHER * samePublisher(a, b) +
    W_PAGES * pageProximity(a, b)
  );
}
