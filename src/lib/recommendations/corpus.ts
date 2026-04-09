import type { BookFeatures } from "./types";

function tokenizeSubject(s: string): string[] {
  const t = s.trim().toLowerCase();
  if (!t) return [];
  return t.split(/[/,;]+|\s+/).filter((x) => x.length > 1);
}

export function subjectsToTerms(subjects: unknown): string[] {
  if (!Array.isArray(subjects)) return [];
  const out: string[] = [];
  for (const x of subjects) {
    if (typeof x === "string") out.push(...tokenizeSubject(x));
  }
  return out;
}

export function jsonAuthorsToStrings(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.filter((x): x is string => typeof x === "string").map((s) => s.trim());
}

/** Build global IDF for subject terms across the corpus (document = one book). */
export function buildSubjectIdf(books: BookFeatures[]): Map<string, number> {
  const docFreq = new Map<string, number>();
  const n = Math.max(1, books.length);
  for (const b of books) {
    const unique = new Set(b.subjectTerms);
    for (const t of unique) {
      docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log(1 + n / (1 + df)));
  }
  return idf;
}

/** TF-IDF vector for one book's subjects (L2-normalized). */
export function bookSubjectTfidf(
  book: BookFeatures,
  idf: Map<string, number>,
): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of book.subjectTerms) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  const maxTf = Math.max(1, ...tf.values());
  const raw = new Map<string, number>();
  for (const [term, c] of tf) {
    const w = (c / maxTf) * (idf.get(term) ?? 0);
    if (w > 0) raw.set(term, w);
  }
  let sumSq = 0;
  for (const w of raw.values()) sumSq += w * w;
  const norm = sumSq > 0 ? Math.sqrt(sumSq) : 1;
  const out = new Map<string, number>();
  for (const [term, w] of raw) {
    out.set(term, w / norm);
  }
  return out;
}
