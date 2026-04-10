/** Per SPECS §16.3 — content similarity weights. */
export const W_AUTHOR = 0.35;
export const W_SUBJECT = 0.3;
export const W_TAG = 0.15;
export const W_LANGUAGE = 0.1;
export const W_PUBLISHER = 0.05;
export const W_PAGES = 0.05;

/** Per SPECS §16.4 — final blend (co-occurrence is an extra collaborative-aggregate term, §16 V2). */
export const W_FINAL_CONTENT = 0.55;
export const W_FINAL_COLLAB = 0.2;
export const W_FINAL_COOC = 0.1;
export const W_FINAL_POPULARITY = 0.1;
export const W_FINAL_RECENCY = 0.05;

/** Minimum shared books for collaborative neighbor (SPECS §16.3). */
export const COLLAB_MIN_COMMON_BOOKS = 5;

/** Stored recommendations per user (SPECS §16.5). */
export const TOP_STORED = 50;

/** Max seconds credited per progress sync (anti-abuse). */
export const PROGRESS_TIME_CAP_SECONDS = 15 * 60;

/** Diversity: multiply score when author already in ranked list. */
export const SAME_AUTHOR_PENALTY = 0.08;

/** Diversity: penalize high subject (TF-IDF) similarity to already picked books. */
export const SAME_SUBJECT_PENALTY = 0.06;

/** Soft language mismatch vs majority language of seeds (candidate has known lang only). */
export const LANGUAGE_MISMATCH_FACTOR = 0.88;

/** Additive bonus when the book has at least one file (before final clamp). */
export const W_HAS_FILE = 0.04;

/** Boost exploration for globally low-signal books (finished count at or below threshold). */
export const NOVELTY_FINISHED_THRESHOLD = 1;
export const W_NOVELTY_RECENCY = 0.12;

/** Penalty scale: max content similarity to negative anchors (dismiss / dislike). */
export const ANCHOR_NEGATIVE_PENALTY = 0.22;

/** Boost scale: max content similarity to explicit like anchors. */
export const ANCHOR_POSITIVE_BOOST = 0.08;

/** Max finished books per user when building co-occurrence (performance cap). */
export const COOC_MAX_FINISHED_PER_USER = 80;
