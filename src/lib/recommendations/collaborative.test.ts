import { describe, expect, it } from "vitest";

import { collaborativeScoreForBook, findNeighbors, userAffinityCosine } from "./collaborative";

function mapFrom(obj: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(obj));
}

describe("collaborative", () => {
  it("userAffinityCosine returns 0 when fewer than 5 books in common", () => {
    const u = mapFrom({ a: 1, b: 2, c: 3, d: 1 });
    const v = mapFrom({ a: 1, b: 1, c: 1, e: 5 });
    const { sim, common } = userAffinityCosine(u, v);
    expect(common).toBe(3);
    expect(sim).toBe(0);
  });

  it("userAffinityCosine computes cosine when common >= 5", () => {
    const u = mapFrom({ a: 1, b: 1, c: 1, d: 1, e: 1 });
    const v = mapFrom({ a: 1, b: 1, c: 1, d: 1, e: 2 });
    const { sim, common } = userAffinityCosine(u, v);
    expect(common).toBe(5);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it("findNeighbors respects minimum common books", () => {
    const target = mapFrom({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 });
    const all = new Map<string, Map<string, number>>([
      ["u1", target],
      ["u2", mapFrom({ a: 1, b: 1, c: 1, d: 1, e: 1, x: 10 })],
      ["u3", mapFrom({ a: 1, b: 1, c: 1 })],
    ]);
    const n = findNeighbors("u1", target, all, 10);
    expect(n.some((x) => x.userId === "u2")).toBe(true);
    expect(n.some((x) => x.userId === "u3")).toBe(false);
  });

  it("collaborativeScoreForBook weights by neighbor similarity", () => {
    const target = mapFrom({ a: 1 });
    const neighbors = [
      { userId: "n1", aff: mapFrom({ z: 1 }), sim: 0.5 },
      { userId: "n2", aff: mapFrom({ z: 0.5 }), sim: 0.5 },
    ];
    const s = collaborativeScoreForBook("z", target, neighbors);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});
