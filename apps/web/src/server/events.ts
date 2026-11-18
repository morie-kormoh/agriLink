import "server-only";
import type { SplitEffect } from "./payments/hooks";

/**
 * Minimal in-process domain event bus. Handlers run after the emitting transaction has committed;
 * a failing handler is logged and never breaks the caller. Handlers must be idempotent.
 * (When the API moves to its own service these become BullMQ "events" jobs.)
 */
export interface DomainEvents {
  "purchase.recorded": { purchaseId: string };
  "purchase.cancelled": { purchaseId: string };
  "payment.completed": { paymentId: string; status: "SUCCESS" | "PARTIAL" | "FAILED" };
  /** A transfer was confirmed and its business effect applied (module 06/08). */
  "split.succeeded": SplitEffect;
  "score.stale": { farmerId: string };
  "voucher.redeemed": { redemptionId: string };
  "loan.statusChanged": { loanId: string; status: string };
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => Promise<void> | void;

const handlers = new Map<keyof DomainEvents, Handler<never>[]>();
let registered: Promise<void> | null = null;

export function on<K extends keyof DomainEvents>(event: K, handler: Handler<K>) {
  const list = handlers.get(event) ?? [];
  list.push(handler as Handler<never>);
  handlers.set(event, list);
}

export async function emit<K extends keyof DomainEvents>(
  event: K,
  payload: DomainEvents[K],
): Promise<void> {
  registered ??= import("./event-handlers").then(() => undefined);
  await registered;
  for (const h of handlers.get(event) ?? []) {
    try {
      await (h as Handler<K>)(payload);
    } catch (e) {
      console.error(`[events] handler for ${event} failed`, e);
    }
  }
}
