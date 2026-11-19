import "server-only";
import { isDemoMode } from "./flags";
import { redis } from "../redis";

/**
 * Demo only: keep the latest SMS so the audience can see them in the on-screen "Phone" panel
 * (on Vercel the server log is not visible). Uses Redis when configured so every server instance
 * sees the same list; otherwise an in-process list.
 */
export interface DemoSms {
  to: string;
  body: string;
  kind: string;
  at: string;
}

const KEY = "agrilink:demo:sms";
const MAX = 40;
const memory: DemoSms[] = [];

export async function logDemoSms(m: DemoSms) {
  if (!isDemoMode()) return;
  if (process.env.REDIS_URL) {
    try {
      await redis()
        .multi()
        .lpush(KEY, JSON.stringify(m))
        .ltrim(KEY, 0, MAX - 1)
        .exec();
      return;
    } catch (e) {
      console.error("[demo-sms] Redis unavailable:", (e as Error).message);
    }
  }
  memory.unshift(m);
  memory.length = Math.min(memory.length, MAX);
}

export async function recentDemoSms(): Promise<DemoSms[]> {
  if (process.env.REDIS_URL) {
    try {
      return (await redis().lrange(KEY, 0, MAX - 1)).map((s) => JSON.parse(s) as DemoSms);
    } catch {
      /* fall through to memory */
    }
  }
  return [...memory];
}

export async function clearDemoSms() {
  memory.length = 0;
  if (process.env.REDIS_URL) {
    try {
      await redis().del(KEY);
    } catch {
      /* ignore */
    }
  }
}
