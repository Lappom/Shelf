import { describe, expect, it, beforeEach } from "vitest";

import { assertSameOriginFromHeaders } from "./origin";

describe("assertSameOriginFromHeaders", () => {
  const prev = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    process.env.NEXTAUTH_URL = prev;
  });

  it("accepts when NEXTAUTH_URL is missing", () => {
    delete process.env.NEXTAUTH_URL;
    expect(() =>
      assertSameOriginFromHeaders({
        origin: "https://evil.example",
        host: "localhost:3000",
      }),
    ).not.toThrow();
  });

  it("accepts when Origin header is missing", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    expect(() =>
      assertSameOriginFromHeaders({
        origin: null,
        host: "localhost:3000",
      }),
    ).not.toThrow();
  });

  it("rejects when Origin does not match app origin", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    expect(() =>
      assertSameOriginFromHeaders({
        origin: "https://evil.example",
        host: "localhost:3000",
      }),
    ).toThrow("BAD_ORIGIN");
  });

  it("accepts when Origin matches app origin", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    expect(() =>
      assertSameOriginFromHeaders({
        origin: "http://localhost:3000",
        host: "localhost:3000",
      }),
    ).not.toThrow();
  });
});
