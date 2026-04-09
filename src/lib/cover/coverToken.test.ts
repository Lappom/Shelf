import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { createCoverAccessToken, verifyCoverAccessToken } from "./coverToken";

describe("coverToken", () => {
  const prevSecret = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "x".repeat(32);
    delete process.env.COVER_TOKEN_SECRET;
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = prevSecret;
  });

  it("create returns null when no secret is configured", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(createCoverAccessToken("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });

  it("verifyCoverAccessToken accepts a valid token for the book id", () => {
    const bookId = "550e8400-e29b-41d4-a716-446655440000";
    const t = createCoverAccessToken(bookId, 1_000_000_000);
    expect(t).toBeTruthy();
    expect(verifyCoverAccessToken(t!, bookId, 1_000_000_000)).toBe(true);
  });

  it("rejects wrong book id", () => {
    const t = createCoverAccessToken("550e8400-e29b-41d4-a716-446655440000", 1_000_000_000);
    expect(verifyCoverAccessToken(t!, "660e8400-e29b-41d4-a716-446655440001", 1_000_000_000)).toBe(
      false,
    );
  });

  it("rejects expired token", () => {
    const bookId = "550e8400-e29b-41d4-a716-446655440000";
    const t = createCoverAccessToken(bookId, 1_000_000_000);
    expect(verifyCoverAccessToken(t!, bookId, 1_000_000_000 + 400)).toBe(false);
  });

  it("rejects tampered signature", () => {
    const bookId = "550e8400-e29b-41d4-a716-446655440000";
    const t = createCoverAccessToken(bookId, 1_000_000_000);
    const broken = `${t!.slice(0, -3)}xxx`;
    expect(verifyCoverAccessToken(broken, bookId, 1_000_000_000)).toBe(false);
  });
});
