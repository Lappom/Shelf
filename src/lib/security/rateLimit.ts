import Redis from "ioredis";

type RateLimitArgs = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number };

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function getRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  return new Redis(url, { maxRetriesPerRequest: 1 });
}

function nowMs() {
  return Date.now();
}

export async function rateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  const t = nowMs();
  const resetAt = t + args.windowMs;

  const redis = getRedis();
  if (redis) {
    const redisKey = `rl:${args.key}:${Math.floor(t / args.windowMs)}`;
    try {
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, args.windowMs);
      const remaining = Math.max(0, args.limit - count);
      await redis.quit();
      if (count > args.limit) return { ok: false, remaining: 0, resetAt };
      return { ok: true, remaining, resetAt };
    } catch {
      try {
        await redis.quit();
      } catch {
        // ignore
      }
      // fall through to memory
    }
  }

  const entry = memoryStore.get(args.key);
  if (!entry || entry.resetAt <= t) {
    memoryStore.set(args.key, { count: 1, resetAt });
    return { ok: true, remaining: args.limit - 1, resetAt };
  }

  entry.count += 1;
  if (entry.count > args.limit) return { ok: false, remaining: 0, resetAt: entry.resetAt };
  return { ok: true, remaining: args.limit - entry.count, resetAt: entry.resetAt };
}

export async function rateLimitOrThrow(args: RateLimitArgs) {
  const res = await rateLimit(args);
  if (!res.ok) throw new Error("RATE_LIMITED");
  return res;
}

