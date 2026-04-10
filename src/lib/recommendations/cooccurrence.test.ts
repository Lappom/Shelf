import { describe, expect, it } from "vitest";

import { buildCooccurrenceScores } from "./cooccurrence";

describe("buildCooccurrenceScores", () => {
  it("returns empty when no seeds", () => {
    const m = buildCooccurrenceScores({
      progressRows: [
        { userId: "u2", bookId: "a", status: "finished" },
        { userId: "u2", bookId: "b", status: "finished" },
      ],
      targetUserId: "u1",
      seedBookIds: new Set(),
    });
    expect(m.size).toBe(0);
  });

  it("boosts books co-finished with seed readers", () => {
    const progressRows = [
      { userId: "u1", bookId: "s1", status: "finished" },
      { userId: "u2", bookId: "s1", status: "finished" },
      { userId: "u2", bookId: "x", status: "finished" },
      { userId: "u2", bookId: "y", status: "finished" },
    ];
    const m = buildCooccurrenceScores({
      progressRows,
      targetUserId: "u1",
      seedBookIds: new Set(["s1"]),
    });
    expect(m.get("x")).toBeDefined();
    expect(m.get("y")).toBeDefined();
    expect((m.get("x") ?? 0) > 0).toBe(true);
  });

  it("ignores target user rows for co-occurrence", () => {
    const m = buildCooccurrenceScores({
      progressRows: [{ userId: "u1", bookId: "only", status: "finished" }],
      targetUserId: "u1",
      seedBookIds: new Set(["s1"]),
    });
    expect(m.size).toBe(0);
  });
});
