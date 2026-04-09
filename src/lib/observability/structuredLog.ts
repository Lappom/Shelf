/**
 * One JSON line per event on stdout (Docker / log aggregators).
 * Never pass secrets (tokens, passwords, raw search queries).
 */

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return value.message;
  return value;
}

export function logShelfEvent(event: string, fields: Record<string, unknown> = {}): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: "info",
    event,
  };
  for (const [k, v] of Object.entries(fields)) {
    const n = normalizeValue(v);
    if (n !== undefined) payload[k] = n;
  }
  console.log(JSON.stringify(payload));
}
