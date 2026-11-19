import "server-only";
import { Redis } from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { __agrilinkRedis?: Redis };

/** Shared Redis connection (lazy). */
export function redis(): Redis {
  if (!globalForRedis.__agrilinkRedis) {
    const url = env().REDIS_URL;
    if (/^https?:\/\//.test(url)) {
      // Upstash shows both a REST URL (https://…) and a Redis URL (rediss://…). ioredis needs the second.
      console.error(
        "[redis] REDIS_URL must be a redis:// or rediss:// URL (for Upstash use the TCP URL, not the REST URL).",
      );
    }
    globalForRedis.__agrilinkRedis = new Redis(url, {
      // Serverless hosts (Vercel) open a fresh connection per instance: let the first command wait for it
      // instead of failing with "Stream isn't writeable", but never hang a request for long.
      enableOfflineQueue: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 3_000,
      lazyConnect: false,
    });
    globalForRedis.__agrilinkRedis.on("error", (e) => {
      if (process.env.NODE_ENV !== "test") console.warn("[redis]", e.message);
    });
  }
  return globalForRedis.__agrilinkRedis;
}
