/** Per SPECS §16.3 — content similarity weights. */
export const W_AUTHOR = 0.35;
export const W_SUBJECT = 0.3;
export const W_TAG = 0.15;
export const W_LANGUAGE = 0.1;
export const W_PUBLISHER = 0.05;
export const W_PAGES = 0.05;

/** Per SPECS §16.4 — final blend. */
export const W_FINAL_CONTENT = 0.6;
export const W_FINAL_COLLAB = 0.25;
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
