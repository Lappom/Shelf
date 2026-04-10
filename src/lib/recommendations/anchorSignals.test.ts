import { describe, expect, it } from "vitest";

import {
  dominantLanguageFromSeeds,
  languageScoreMultiplier,
  noveltyRecencyBoost,
} from "./anchorSignals";
import type { BookFeatures } from "./types";

function bf(p: Partial<BookFeatures> & Pick<BookFeatures, "id" | "title">): BookFeatures {
  return {
    authors: [],
    subjectTerms: [],
    tagIds: [],
    language: null,
    publisher: null,
    pageCount: null,
    createdAt: new Date(),
    fileCount: 0,
    ...p,
  };
}

describe("anchorSignals", () => {
  it("dominantLanguageFromSeeds picks majority", () => {
    const seeds = [
      bf({ id: "1", title: "A", language: "fr" }),
      bf({ id: "2", title: "B", language: "fr" }),
      bf({ id: "3", title: "C", language: "en" }),
    ];
    expect(dominantLanguageFromSeeds(seeds)).toBe("fr");
  });

  it("languageScoreMultiplier is neutral without dominant", () => {
    expect(languageScoreMultiplier("en", null)).toBe(1);
  });

  it("noveltyRecencyBoost only for low global finished count", () => {
    expect(noveltyRecencyBoost(0, 0.5)).toBeGreaterThan(0);
    expect(noveltyRecencyBoost(5, 0.5)).toBe(0);
  });
});
