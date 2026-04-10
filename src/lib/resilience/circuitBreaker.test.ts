import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/structuredLog", () => ({
  logShelfEvent: vi.fn(),
}));

describe("circuitBreaker", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.EXTERNAL_CB_FAILURE_THRESHOLD = "2";
    process.env.EXTERNAL_CB_COOLDOWN_MS = "5000";
  });

  it("opens after threshold failures then rejects fast", async () => {
    const { withCircuitBreaker } = await import("./circuitBreaker");

    await expect(
      withCircuitBreaker("test-br", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(
      withCircuitBreaker("test-br", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(withCircuitBreaker("test-br", async () => "ok")).rejects.toThrow("Circuit breaker open");
  });

  it("closes again after successful call in half_open", async () => {
    process.env.EXTERNAL_CB_COOLDOWN_MS = "5000";
    const t0 = new Date("2020-01-01T00:00:00.000Z").getTime();
    vi.useFakeTimers({ now: t0 });
    const { withCircuitBreaker } = await import("./circuitBreaker");

    await expect(
      withCircuitBreaker("half", async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    await expect(
      withCircuitBreaker("half", async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");

    await expect(withCircuitBreaker("half", async () => "a")).rejects.toThrow("Circuit breaker open");

    vi.setSystemTime(t0 + 6_000);

    await expect(withCircuitBreaker("half", async () => "fixed")).resolves.toBe("fixed");
    await expect(withCircuitBreaker("half", async () => "again")).resolves.toBe("again");

    vi.useRealTimers();
  });
});
