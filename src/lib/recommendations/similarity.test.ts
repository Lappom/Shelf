import { describe, expect, it } from "vitest";

import {
  authorOverlap,
  contentSimilarity,
  pageProximity,
  sameLanguage,
  sparseCosine,
  tagJaccard,
} from "./similarity";
import type { BookFeatures } from "./types";

function book(p: Partial<BookFeatures> & Pick<BookFeatures, "id" | "title">): BookFeatures {
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

describe("similarity", () => {
  it("authorOverlap is Jaccard on normalized names", () => {
    const a = book({ id: "1", title: "A", authors: ["Ada Lovelace"] });
    const b = book({ id: "2", title: "B", authors: ["ada lovelace", "Other"] });
    expect(authorOverlap(a, b)).toBeCloseTo(1 / 2);
  });

  it("tagJaccard handles empty sets", () => {
    const a = book({ id: "1", title: "A", tagIds: ["t1"] });
    const b = book({ id: "2", title: "B", tagIds: [] });
    expect(tagJaccard(a, b)).toBe(0);
  });

  it("sameLanguage requires both sides", () => {
    const a = book({ id: "1", title: "A", language: "fr" });
    const b = book({ id: "2", title: "B", language: null });
    expect(sameLanguage(a, b)).toBe(0);
  });

  it("pageProximity peaks when equal", () => {
    const a = book({ id: "1", title: "A", pageCount: 200 });
    const b = book({ id: "2", title: "B", pageCount: 200 });
    expect(pageProximity(a, b)).toBe(1);
  });

  it("sparseCosine is 1 for identical normalized vectors", () => {
    const v = new Map([
      ["a", 0.6],
      ["b", 0.8],
    ]);
    expect(sparseCosine(v, v)).toBeCloseTo(1);
  });

  it("contentSimilarity matches §16.3 structure", () => {
    const s = book({
      id: "s",
      title: "Seed",
      authors: ["A. Writer"],
      subjectTerms: ["sci-fi"],
      tagIds: ["t1"],
      language: "fr",
      publisher: "Pub",
      pageCount: 300,
    });
    const c = book({
      id: "c",
      title: "Cand",
      authors: ["A. Writer"],
      subjectTerms: ["sci-fi"],
      tagIds: ["t1"],
      language: "fr",
      publisher: "Pub",
      pageCount: 300,
    });
    const tfS = new Map([["sci-fi", 1]]);
    const tfC = new Map([["sci-fi", 1]]);
    const sim = contentSimilarity(s, c, tfS, tfC);
    expect(sim).toBeGreaterThan(0.9);
  });
});
