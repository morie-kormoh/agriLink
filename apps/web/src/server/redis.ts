import "server-only";
import { Redis } from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { __agripayRedis?: Redis };

/** Shared Redis connection (lazy). */
export function redis(): Redis {
  if (!globalForRedis.__agripayRedis) {
    globalForRedis.__agripayRedis = new Redis(env().REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    globalForRedis.__agripayRedis.on("error", (e) => {
      if (process.env.NODE_ENV !== "test") console.warn("[redis]", e.message);
    });
  }
  return globalForRedis.__agripayRedis;
}
