import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = {
  $queryRaw: vi.fn(),
  duplicatePair: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMock,
}));

describe("duplicates scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scanHashCandidates expands groups into ordered pairs", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { contentHash: "h1", bookIds: ["b2", "b1", "b3"] },
    ]);

    const { scanHashCandidates } = await import("./scan");
    const pairs = await scanHashCandidates({ maxPairs: 100 });

    expect(pairs).toEqual([
      { bookIdA: "b1", bookIdB: "b2", score: null },
      { bookIdA: "b2", bookIdB: "b3", score: null },
      { bookIdA: "b1", bookIdB: "b3", score: null },
    ]);
  });

  it("upsertDuplicatePairs creates when missing and updates when present", async () => {
    prismaMock.duplicatePair.findUnique.mockResolvedValueOnce(null);
    prismaMock.duplicatePair.findUnique.mockResolvedValueOnce({ id: "p1", status: "ignored" });

    const { upsertDuplicatePairs } = await import("./scan");
    const res = await upsertDuplicatePairs({
      kind: "hash",
      scannedAt: new Date("2026-01-01T00:00:00Z"),
      candidates: [
        { bookIdA: "a", bookIdB: "b", score: null },
        { bookIdA: "c", bookIdB: "d", score: null },
      ],
    });

    expect(res).toEqual({ created: 1, updated: 1 });
    expect(prismaMock.duplicatePair.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.duplicatePair.update).toHaveBeenCalledTimes(1);
  });
});
