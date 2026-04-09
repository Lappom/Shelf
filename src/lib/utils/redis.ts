import Redis from "ioredis";

declare global {
  var __shelf_redis: Redis | undefined;
}

export function getRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  if (globalThis.__shelf_redis) return globalThis.__shelf_redis;

  const client = new Redis(url, { maxRetriesPerRequest: 1 });
  if (process.env.NODE_ENV !== "production") globalThis.__shelf_redis = client;
  return client;
}
