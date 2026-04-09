import { describe, expect, it } from "vitest";

import { applyAuthorDiversity, finalScore, popularityScore, recencyBonus } from "./aggregate";
import type { BookFeatures } from "./types";

describe("aggregate", () => {
  it("recencyBonus decays with age", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const recent = new Date("2026-01-10T12:00:00Z");
    const old = new Date("2024-01-10T12:00:00Z");
    expect(recencyBonus(recent, now)).toBeGreaterThan(recencyBonus(old, now));
  });

  it("popularityScore caps at 1", () => {
    expect(popularityScore(100, 50)).toBe(1);
    expect(popularityScore(5, 100)).toBe(0.05);
  });

  it("finalScore renormalizes when collaborative disabled", () => {
    const withCollab = finalScore(0.8, 0.2, 0.5, 0.5, true);
    const noCollab = finalScore(0.8, 0, 0.5, 0.5, false);
    expect(withCollab).toBeGreaterThan(0);
    expect(noCollab).toBeGreaterThan(0);
    expect(noCollab).toBeGreaterThan(withCollab);
  });

  it("applyAuthorDiversity spreads authors in top-K", () => {
    const books = new Map<string, BookFeatures>([
      [
        "b1",
        {
          id: "b1",
          title: "T1",
          authors: ["Same"],
          subjectTerms: [],
          tagIds: [],
          language: null,
          publisher: null,
          pageCount: null,
          createdAt: new Date(),
        },
      ],
      [
        "b2",
        {
          id: "b2",
          title: "T2",
          authors: ["Same"],
          subjectTerms: [],
          tagIds: [],
          language: null,
          publisher: null,
          pageCount: null,
          createdAt: new Date(),
        },
      ],
      [
        "b3",
        {
          id: "b3",
          title: "T3",
          authors: ["Other"],
          subjectTerms: [],
          tagIds: [],
          language: null,
          publisher: null,
          pageCount: null,
          createdAt: new Date(),
        },
      ],
    ]);
    const sorted = [
      { bookId: "b1", score: 1, content: 1, collab: 0, popularity: 0, recency: 0 },
      { bookId: "b2", score: 0.99, content: 1, collab: 0, popularity: 0, recency: 0 },
      { bookId: "b3", score: 0.98, content: 1, collab: 0, popularity: 0, recency: 0 },
    ];
    const out = applyAuthorDiversity(sorted, books, 3);
    expect(out[0]!.bookId).toBe("b1");
    expect(out.map((x) => x.bookId).includes("b3")).toBe(true);
  });
});
