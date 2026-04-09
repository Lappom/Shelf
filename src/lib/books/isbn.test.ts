import { describe, expect, it } from "vitest";

import { normalizeIsbn } from "./isbn";

describe("normalizeIsbn", () => {
  it("accepts ISBN-13 with hyphens and spaces", () => {
    expect(normalizeIsbn("978-2-07-036822-8")).toBe("9782070368228");
    expect(normalizeIsbn("978 2 07 036822 8")).toBe("9782070368228");
  });

  it("accepts plain ISBN-13", () => {
    expect(normalizeIsbn("9781234567890")).toBe("9781234567890");
  });

  it("accepts ISBN-10 with X check digit", () => {
    expect(normalizeIsbn("0306406152")).toBe("0306406152");
    expect(normalizeIsbn("0-306-40615-2")).toBe("0306406152");
    expect(normalizeIsbn("123456789X")).toBe("123456789X");
  });

  it("returns null for empty or whitespace", () => {
    expect(normalizeIsbn("")).toBeNull();
    expect(normalizeIsbn("   ")).toBeNull();
    expect(normalizeIsbn(null)).toBeNull();
    expect(normalizeIsbn(undefined)).toBeNull();
  });

  it("rejects wrong lengths and ISSN-like strings", () => {
    expect(normalizeIsbn("123456789")).toBeNull();
    expect(normalizeIsbn("123456789012")).toBeNull();
    expect(normalizeIsbn("12345678901234")).toBeNull();
    expect(normalizeIsbn("1234-5678")).toBeNull();
    expect(normalizeIsbn("ISSN 1234-5678")).toBeNull();
  });

  it("uppercases trailing X for ISBN-10", () => {
    expect(normalizeIsbn("123456789x")).toBe("123456789X");
  });
});
