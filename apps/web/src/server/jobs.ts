import "server-only";
import { expireVouchers } from "./credit/vouchers";
import { runArrearsJob } from "./credit/loans";
import { expireConsents } from "./passport/consent";
import { recomputeAllScores } from "./passport/service";
import { runScheduledReleases } from "./savings/service";

/**
 * Scheduled jobs (modules 06–08). The worker calls /api/internal/jobs/{name} on a schedule;
 * each job is idempotent, so running it twice is harmless.
 */
export const JOBS = {
  "savings-releases": (now: Date) => runScheduledReleases(now),
  "loan-arrears": (now: Date) => runArrearsJob(now),
  "consent-expiry": (now: Date) => expireConsents(now),
  "voucher-expiry": (now: Date) => expireVouchers(now),
  "scores-nightly": () => recomputeAllScores(),
} as const;

export type JobName = keyof typeof JOBS;

export async function runJob(name: string, now = new Date()) {
  const fn = (JOBS as Record<string, (now: Date) => Promise<unknown>>)[name];
  if (!fn) return null;
  return fn(now);
}

/** All daily jobs in a sensible order. */
export async function runDailyJobs(now = new Date()) {
  const out: Record<string, unknown> = {};
  for (const name of [
    "consent-expiry",
    "voucher-expiry",
    "loan-arrears",
    "savings-releases",
  ] as const)
    out[name] = await JOBS[name](now);
  return out;
}
