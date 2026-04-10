import { describe, expect, it, beforeEach, vi } from "vitest";

import { assertSameOriginFromHeaders } from "./origin";

describe("assertSameOriginFromHeaders", () => {
  const prev = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    process.env.NEXTAUTH_URL = prev;
    vi.unstubAllEnvs();
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

  it("in non-production, accepts loopback host alias mismatch when protocol and port match", () => {
    process.env.NEXTAUTH_URL = "http://127.0.0.1:3000";
    expect(() =>
      assertSameOriginFromHeaders({
        origin: "http://localhost:3000",
        host: "localhost:3000",
      }),
    ).not.toThrow();
  });

  it("in production, rejects loopback host alias mismatch", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXTAUTH_URL = "http://127.0.0.1:3000";
    expect(() =>
      assertSameOriginFromHeaders({
        origin: "http://localhost:3000",
        host: "localhost:3000",
      }),
    ).toThrow("BAD_ORIGIN");
  });
});
