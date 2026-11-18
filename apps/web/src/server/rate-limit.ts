import "server-only";
import { env } from "./env";
import { redis } from "./redis";

/**
 * Fixed-window rate limiter. Uses Redis in normal operation and an in-memory map
 * when RATE_LIMIT_STORE=memory (tests, serverless demos), when no REDIS_URL is configured
 * (e.g. a Vercel demo without Redis), or if Redis is unreachable in development.
 * Note: the in-memory map is per server instance, so limits are approximate on serverless hosts.
 */
const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, windowSec: number): number {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export async function hitRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; count: number }> {
  let count: number;
  if (env().RATE_LIMIT_STORE === "memory" || !process.env.REDIS_URL) {
    count = memoryHit(key, windowSec);
  } else {
    try {
      const k = `ratelimit:${key}`;
      const res = await redis().multi().incr(k).expire(k, windowSec, "NX").exec();
      count = Number(res?.[0]?.[1] ?? 1);
    } catch (e) {
      if (process.env.NODE_ENV === "production") throw e;
      console.warn("[rate-limit] Redis unavailable, using in-memory limiter:", (e as Error).message);
      count = memoryHit(key, windowSec);
    }
  }
  return { allowed: count <= limit, count };
}

/** Test helper. */
export function resetMemoryRateLimits() {
  memory.clear();
}
