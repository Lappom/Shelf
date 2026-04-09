import { describe, expect, it } from "vitest";

import { rateLimit } from "./rateLimit";

describe("rateLimit", () => {
  it("limits after reaching the limit (memory fallback)", async () => {
    delete process.env.REDIS_URL;
    const key = `test:${Math.random().toString(16).slice(2)}`;

    const a = await rateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(a.ok).toBe(true);

    const b = await rateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(b.ok).toBe(true);

    const c = await rateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(c.ok).toBe(false);
  });
});
