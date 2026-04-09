import { describe, expect, it } from "vitest";

import { threeWayMergeAllFields, type SyncMetadata } from "./metadataSync";

function baseMeta(overrides: Partial<SyncMetadata> = {}): SyncMetadata {
  return {
    title: "T",
    authors: ["A"],
    language: "en",
    description: "D",
    isbn10: "0306406152",
    isbn13: "9781234567890",
    publisher: "P",
    publishDate: "2020",
    subjects: ["S1"],
    pageCount: 100,
    openLibraryId: "/works/OL1W",
    ...overrides,
  };
}

describe("threeWayMergeAllFields", () => {
  it("case 1: no changes", () => {
    const snap = baseMeta();
    const epub = baseMeta();
    const db = baseMeta();
    const res = threeWayMergeAllFields({ epub, db, snapshot: snap });
    expect(res.requiresWriteback).toBe(false);
    expect(res.fields.every((f) => f.decision === "no_change")).toBe(true);
  });

  it("case 2: EPUB changed, DB not -> take_epub", () => {
    const snap = baseMeta({ title: "Old" });
    const epub = baseMeta({ title: "New from EPUB" });
    const db = baseMeta({ title: "Old" });
    const res = threeWayMergeAllFields({ epub, db, snapshot: snap });
    const title = res.fields.find((f) => f.field === "title");
    expect(title?.decision).toBe("take_epub");
    expect(res.mergedDb.title).toBe("New from EPUB");
    expect(res.requiresWriteback).toBe(false);
  });

  it("case 3: DB changed, EPUB not -> take_db (requires writeback)", () => {
    const snap = baseMeta({ description: "Old" });
    const epub = baseMeta({ description: "Old" });
    const db = baseMeta({ description: "New from DB" });
    const res = threeWayMergeAllFields({ epub, db, snapshot: snap });
    const desc = res.fields.find((f) => f.field === "description");
    expect(desc?.decision).toBe("take_db");
    expect(res.requiresWriteback).toBe(true);
  });

  it("case 4: conflict -> EPUB wins", () => {
    const snap = baseMeta({ language: "en" });
    const epub = baseMeta({ language: "fr" });
    const db = baseMeta({ language: "de" });
    const res = threeWayMergeAllFields({ epub, db, snapshot: snap });
    const lang = res.fields.find((f) => f.field === "language");
    expect(lang?.decision).toBe("conflict_take_epub");
    expect(res.mergedDb.language).toBe("fr");
  });

  it("authors array: EPUB changed, DB not -> take_epub", () => {
    const snap = baseMeta({ authors: ["Old Author"] });
    const epub = baseMeta({ authors: ["New Epub Author"] });
    const db = baseMeta({ authors: ["Old Author"] });
    const res = threeWayMergeAllFields({ epub, db, snapshot: snap });
    const authors = res.fields.find((f) => f.field === "authors");
    expect(authors?.decision).toBe("take_epub");
    expect(res.mergedDb.authors).toEqual(["New Epub Author"]);
    expect(res.requiresWriteback).toBe(false);
  });

  it("db-only fields do not require writeback", () => {
    const snap = baseMeta({ pageCount: 100, openLibraryId: "/works/OL1W" });
    const epub = baseMeta({ pageCount: null, openLibraryId: null });
    const db = baseMeta({ pageCount: 120, openLibraryId: "/works/OL2W" });
    const res = threeWayMergeAllFields({ epub, db, snapshot: snap });
    expect(res.requiresWriteback).toBe(false);
    expect(res.fields.find((f) => f.field === "pageCount")?.decision).toBe("take_db");
    expect(res.fields.find((f) => f.field === "openLibraryId")?.decision).toBe("take_db");
  });
});
