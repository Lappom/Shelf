import Redis from "ioredis";

declare global {
  var __shelf_redis: Redis | undefined;
}

function parseRedisUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (url === "/" || url.startsWith("/")) return null;

  try {
    const u = new URL(url);
    if (u.protocol !== "redis:" && u.protocol !== "rediss:") return null;
    return url;
  } catch {
    return null;
  }
}

export function getRedis() {
  const url = process.env.REDIS_URL ? parseRedisUrl(process.env.REDIS_URL) : null;
  if (!url) return null;

  if (globalThis.__shelf_redis) return globalThis.__shelf_redis;

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  // Prevent "Unhandled error event" crashes when Redis is unreachable/misconfigured.
  client.on("error", () => {});

  globalThis.__shelf_redis = client;
  return client;
}
