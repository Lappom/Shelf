import { describe, expect, it } from "vitest";

import {
  decodePullBooksCursor,
  encodePullBooksCursor,
  hashPullBooksQuery,
} from "@/lib/admin/pullBooksCursor";

describe("pullBooksCursor", () => {
  it("round-trips cursor payload", () => {
    const payload = { v: 1 as const, q: "test query", offset: 40 };
    const enc = encodePullBooksCursor(payload);
    expect(decodePullBooksCursor(enc)).toEqual(payload);
  });

  it("rejects invalid cursor", () => {
    expect(() => decodePullBooksCursor("not-valid-base64!!!")).toThrow("INVALID_CURSOR");
    expect(() => decodePullBooksCursor(encodePullBooksCursor({ v: 1, q: "", offset: 0 }))).toThrow(
      "INVALID_CURSOR",
    );
  });

  it("has stable query hash", () => {
    expect(hashPullBooksQuery("hello")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPullBooksQuery("hello")).toBe(hashPullBooksQuery("hello"));
    expect(hashPullBooksQuery("a")).not.toBe(hashPullBooksQuery("b"));
  });
});
