import path from "node:path";
import { config as loadEnv } from "dotenv";
import { type ConnectionOptions, type Job, Queue, Worker } from "bullmq";
import { maskPhone } from "@agripay/validation";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

/**
 * Background worker.
 *  - sms:       deliver SMS (console provider until module 10 adds aggregators)
 *  - payments:  execute queued payments (PAYMENT_EXECUTION=queue) and run the retry/status-poll tick every minute
 *  - scoring:   debounced passport score recompute (SCORE_EXECUTION=queue)
 *  - jobs:      daily savings releases, loan arrears, consent & voucher expiry (06:00 Freetown/UTC); nightly scores
 * Business logic stays in the API: the worker calls internal endpoints with INTERNAL_API_TOKEN.
 */
export const QUEUES = ["sms", "payments", "scoring", "reports", "events"] as const;

const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port || 6379),
  password: url.password || undefined,
};
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TOKEN = process.env.INTERNAL_API_TOKEN ?? "";

async function internal(pathname: string, body: unknown = {}) {
  const res = await fetch(`${APP_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${pathname} → ${res.status} ${await res.text()}`);
  return res.json();
}

type SmsJob = { to: string; body: string; kind: string };

async function deliverSms(job: Job<SmsJob>) {
  const { to, body, kind } = job.data;
  const shown = process.env.NODE_ENV === "production" && kind === "otp" ? "<otp hidden>" : body;
  console.info(
    `📱 [worker sms → ${process.env.NODE_ENV === "production" ? maskPhone(to) : to}] ${shown}`,
  );
}

async function payments(job: Job<{ paymentId?: string }>) {
  if (job.name === "execute" && job.data.paymentId)
    return internal("/api/internal/payments/execute", { paymentId: job.data.paymentId });
  if (job.name === "tick") return internal("/api/internal/payments/tick");
  return null;
}

async function scoring(job: Job<{ farmerId: string }>) {
  return internal("/api/internal/jobs/score", { farmerId: job.data.farmerId });
}

async function jobs(job: Job) {
  return internal(`/api/internal/jobs/${job.name}`);
}

const workers = [
  new Worker<SmsJob>("sms", deliverSms, { connection, concurrency: 10 }),
  new Worker("payments", payments, { connection, concurrency: 4 }),
  new Worker("scoring", scoring, { connection, concurrency: 4 }),
  new Worker("jobs", jobs, { connection, concurrency: 1 }),
];
for (const w of workers) {
  w.on("failed", (job, err) =>
    console.error(`[worker] ${w.name}/${job?.name} ${job?.id} failed:`, err.message),
  );
}

// Retries + status polls every minute (repeatable job, one per cluster).
const paymentsQueue = new Queue("payments", { connection });
await paymentsQueue.upsertJobScheduler(
  "payments-tick",
  { every: 60_000 },
  { name: "tick", data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } },
);

// Daily finance jobs (Sierra Leone is UTC+0) and a nightly score refresh.
const jobsQueue = new Queue("jobs", { connection });
await jobsQueue.upsertJobScheduler(
  "daily",
  { pattern: "0 6 * * *" },
  { name: "daily", data: {}, opts: { removeOnComplete: 30, removeOnFail: 30 } },
);
await jobsQueue.upsertJobScheduler(
  "scores-nightly",
  { pattern: "30 1 * * *" },
  { name: "scores-nightly", data: {}, opts: { removeOnComplete: 30, removeOnFail: 30 } },
);

console.info(
  `[worker] queues: ${workers.map((w) => w.name).join(", ")} · payment tick every 60s → ${APP_URL}`,
);

async function shutdown() {
  await Promise.all([...workers.map((w) => w.close()), paymentsQueue.close(), jobsQueue.close()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
