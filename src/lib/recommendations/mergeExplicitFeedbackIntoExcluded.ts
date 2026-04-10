/**
 * Books with explicit like/dislike remain score anchors for other titles but are
 * excluded from the candidate pool so they are not shown again in "Pour vous".
 */
export function mergeExplicitFeedbackIntoExcluded(
  excluded: Set<string>,
  feedbackRows: ReadonlyArray<{ bookId: string }>,
): void {
  for (const row of feedbackRows) {
    excluded.add(row.bookId);
  }
}
