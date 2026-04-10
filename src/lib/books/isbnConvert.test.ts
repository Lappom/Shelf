import { describe, expect, it } from "vitest";

import { isbn10ToIsbn13, isbn13CompatibleWithIsbn10 } from "./isbnConvert";

describe("isbnConvert", () => {
  it("converts ISBN-10 to ISBN-13 (978 prefix)", () => {
    expect(isbn10ToIsbn13("0306406152")).toBe("9780306406157");
  });

  it("detects compatible ISBN-13 for ISBN-10", () => {
    expect(isbn13CompatibleWithIsbn10("9780306406157", "0306406152")).toBe(true);
    expect(isbn13CompatibleWithIsbn10("9781234567890", "0306406152")).toBe(false);
  });
});
