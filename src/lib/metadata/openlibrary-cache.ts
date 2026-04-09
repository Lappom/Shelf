import { getRedis } from "@/lib/utils/redis";

const TTL_SECONDS = 60 * 60 * 24 * 30;

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function setCachedJson(key: string, value: unknown): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(key, JSON.stringify(value), "EX", TTL_SECONDS);
}
