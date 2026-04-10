import { describe, expect, it } from "vitest";

import { normalizeOpenLibraryId } from "@/lib/admin/pullBooks";

describe("normalizeOpenLibraryId", () => {
  it("keeps leading slash keys", () => {
    expect(normalizeOpenLibraryId("/works/OL45804W")).toBe("/works/OL45804W");
  });

  it("adds leading slash when missing", () => {
    expect(normalizeOpenLibraryId("works/OL1W")).toBe("/works/OL1W");
  });

  it("returns null for blank", () => {
    expect(normalizeOpenLibraryId("")).toBeNull();
    expect(normalizeOpenLibraryId("   ")).toBeNull();
  });
});
