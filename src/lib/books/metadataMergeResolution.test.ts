import { describe, expect, it } from "vitest";

import {
  analyzeMetadataMerge,
  buildMergedFromDecisions,
  defaultDecisionsFromAnalysis,
  mergedRequiresWriteback,
} from "./metadataMergeResolution";
import type { SyncMetadata } from "./syncMetadataSchema";

function base(overrides: Partial<SyncMetadata> = {}): SyncMetadata {
  return {
    title: "T",
    authors: ["A"],
    language: "en",
    description: "D",
    isbn10: "0306406152",
    isbn13: "9780306406157",
    publisher: "P",
    publishDate: "2020",
    subjects: ["S1"],
    pageCount: 100,
    openLibraryId: "/works/OL1W",
    ...overrides,
  };
}

describe("analyzeMetadataMerge", () => {
  it("flags technical conflict and lowers confidence", () => {
    const snap = base({ language: "en" });
    const epub = base({ language: "fr" });
    const db = base({ language: "de" });
    const { fields } = analyzeMetadataMerge({ epubNorm: epub, dbNorm: db, snapNorm: snap });
    const lang = fields.find((f) => f.field === "language");
    expect(lang?.technicalConflict).toBe(true);
    expect(lang?.automaticDecision).toBe("conflict_take_epub");
    expect(lang?.confidence).toBeLessThan(0.5);
  });
});

describe("buildMergedFromDecisions", () => {
  it("applies use_source and use_snapshot", () => {
    const epubNorm = base({ title: "From Epub" });
    const dbNorm = base({ title: "From Db" });
    const snapNorm = base({ title: "From Snap" });
    const merged = buildMergedFromDecisions({
      decisions: [
        { field: "title", mode: "use_source" },
        { field: "authors", mode: "use_snapshot" },
      ],
      epubNorm,
      dbNorm,
      snapNorm,
    });
    expect(merged.error).toBeUndefined();
    expect(merged.merged.title).toBe("From Epub");
    expect(merged.merged.authors).toEqual(snapNorm.authors);
  });
});

describe("mergedRequiresWriteback", () => {
  it("is true when merged OPF fields differ from epub", () => {
    const epub = base({ description: "E" });
    const merged = base({ description: "D" });
    expect(mergedRequiresWriteback(merged, epub)).toBe(true);
  });

  it("is false when OPF-aligned fields match epub", () => {
    const epub = base();
    const merged = base({ pageCount: 999, openLibraryId: "/x" });
    expect(mergedRequiresWriteback(merged, epub)).toBe(false);
  });
});

describe("defaultDecisionsFromAnalysis", () => {
  it("maps take_epub to use_source", () => {
    const snap = base({ title: "Old" });
    const epub = base({ title: "New" });
    const db = base({ title: "Old" });
    const { fields } = analyzeMetadataMerge({ epubNorm: epub, dbNorm: db, snapNorm: snap });
    const dec = defaultDecisionsFromAnalysis(fields);
    const t = dec.find((d) => d.field === "title");
    expect(t?.mode).toBe("use_source");
  });
});
