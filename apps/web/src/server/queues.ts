import "server-only";
import { Queue } from "bullmq";
import { env } from "./env";

const queues = new Map<string, Queue>();

/** Shared BullMQ queue handles (lazy). The worker app consumes them. */
export function queue(name: "sms" | "payments" | "events" | "scoring" | "jobs"): Queue {
  let q = queues.get(name);
  if (!q) {
    const url = new URL(env().REDIS_URL);
    q = new Queue(name, {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password || undefined,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    queues.set(name, q);
  }
  return q;
}
