import { logShelfEvent } from "@/lib/observability/structuredLog";

export type CircuitState = "closed" | "open" | "half_open";

type BreakerRecord = {
  state: CircuitState;
  failures: number;
  openedAtMs: number | null;
  halfOpenAttempts: number;
};

const store = new Map<string, BreakerRecord>();

function getRecord(name: string): BreakerRecord {
  let r = store.get(name);
  if (!r) {
    r = { state: "closed", failures: 0, openedAtMs: null, halfOpenAttempts: 0 };
    store.set(name, r);
  }
  return r;
}

function getFailureThreshold() {
  const raw = process.env.EXTERNAL_CB_FAILURE_THRESHOLD?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 50) return Math.trunc(n);
  return 5;
}

function getCooldownMs() {
  const raw = process.env.EXTERNAL_CB_COOLDOWN_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1_000 && n <= 600_000) return Math.trunc(n);
  return 60_000;
}

function transitionToOpen(name: string, r: BreakerRecord) {
  if (r.state !== "open") {
    logShelfEvent("external_circuit_open", { name, failures: r.failures });
  }
  r.state = "open";
  r.openedAtMs = Date.now();
  r.failures = 0;
  r.halfOpenAttempts = 0;
}

function transitionToClosed(name: string, r: BreakerRecord) {
  if (r.state !== "closed") {
    logShelfEvent("external_circuit_closed", { name });
  }
  r.state = "closed";
  r.failures = 0;
  r.openedAtMs = null;
  r.halfOpenAttempts = 0;
}

/**
 * Process-local circuit breaker. Not shared across serverless instances (see SPECS).
 */
export async function withCircuitBreaker<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const r = getRecord(name);
  const cooldownMs = getCooldownMs();
  const threshold = getFailureThreshold();

  if (r.state === "open") {
    const elapsed = r.openedAtMs ? Date.now() - r.openedAtMs : cooldownMs;
    if (elapsed >= cooldownMs) {
      r.state = "half_open";
      r.halfOpenAttempts = 0;
      logShelfEvent("external_circuit_half_open", { name });
    } else {
      const err = new Error(`Circuit breaker open (${name})`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err as any).code = "CIRCUIT_OPEN";
      throw err;
    }
  }

  try {
    const out = await fn();
    if (r.state === "half_open") {
      transitionToClosed(name, r);
    } else {
      r.failures = 0;
    }
    return out;
  } catch (e) {
    if (r.state === "half_open") {
      transitionToOpen(name, r);
    } else {
      r.failures += 1;
      if (r.failures >= threshold) {
        transitionToOpen(name, r);
      }
    }
    throw e;
  }
}

/** For ops-summary: best-effort local view (undefined in SSR worker pool). */
export function getCircuitBreakerSnapshot(): Record<string, CircuitState> {
  const out: Record<string, CircuitState> = {};
  for (const [k, v] of store.entries()) {
    out[k] = v.state;
  }
  return out;
}
