import "server-only";
import { Queue } from "bullmq";
import { maskPhone } from "@agripay/validation";
import { env } from "./env";

/**
 * Minimal SMS sender for modules 01–02. Module 10 replaces this with the full
 * notification service (templates, dedupe, quiet hours, delivery reports).
 *
 * SMS_PROVIDER:
 *   console – print to the server log (development / demo)
 *   memory  – keep in an in-process outbox (automated tests)
 *   queue   – enqueue on the BullMQ "sms" queue for apps/worker to deliver
 */
export interface OutboundSms {
  to: string;
  body: string;
  /** Category for logs; OTP bodies are never logged in production. */
  kind: "otp" | "invite" | "welcome" | "security" | "general";
  at: Date;
}

const outbox: OutboundSms[] = [];
let queue: Queue | null = null;

function smsQueue(): Queue {
  if (!queue) {
    const url = new URL(env().REDIS_URL);
    queue = new Queue("sms", {
      connection: {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password || undefined,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 1000,
      },
    });
  }
  return queue;
}

export async function sendSms(
  to: string,
  body: string,
  kind: OutboundSms["kind"] = "general",
): Promise<void> {
  const msg: OutboundSms = { to, body, kind, at: new Date() };
  const provider = env().SMS_PROVIDER;

  if (provider === "memory") {
    outbox.push(msg);
    return;
  }
  if (provider === "queue") {
    try {
      await smsQueue().add(kind, { to, body, kind });
      return;
    } catch (e) {
      console.error("[sms] failed to enqueue, falling back to console:", (e as Error).message);
    }
  }
  // console provider
  const safeBody = kind === "otp" && process.env.NODE_ENV === "production" ? "<otp hidden>" : body;
  console.info(
    `\n📱 [SMS → ${process.env.NODE_ENV === "production" ? maskPhone(to) : to}] ${safeBody}\n`,
  );
}

/** Test helpers */
export function smsOutbox(): readonly OutboundSms[] {
  return outbox;
}
export function clearSmsOutbox() {
  outbox.length = 0;
}
