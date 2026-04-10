import { describe, expect, test } from "vitest";

import { mergeExplicitFeedbackIntoExcluded } from "./mergeExplicitFeedbackIntoExcluded";

describe("mergeExplicitFeedbackIntoExcluded", () => {
  test("adds every feedback bookId to the excluded set", () => {
    const excluded = new Set<string>(["keep"]);
    mergeExplicitFeedbackIntoExcluded(excluded, [
      { bookId: "a" },
      { bookId: "b" },
      { bookId: "a" },
    ]);
    expect(excluded.has("keep")).toBe(true);
    expect(excluded.has("a")).toBe(true);
    expect(excluded.has("b")).toBe(true);
    expect(excluded.size).toBe(3);
  });
});
