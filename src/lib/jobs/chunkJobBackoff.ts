/** Bounded exponential backoff between chunk retries (admin import jobs). */
export function computeChunkJobBackoffMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}
