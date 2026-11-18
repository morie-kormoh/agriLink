import Decimal from "decimal.js";
import { nextMonthDay } from "./credit";

/** Savings rules (module 06) — pure. */

/** Next release date for a Harvest Lock: the next MM-DD strictly after `from` (UTC midnight). */
export function nextReleaseDate(releaseMonthDay: string, from: Date): Date {
  return nextMonthDay(releaseMonthDay, from, 0);
}

/** Fee for an early (emergency) withdrawal. The fee is taken from the savings, the farmer receives the rest. */
export function earlyWithdrawalFee(
  amountLe: Decimal.Value,
  feePct: Decimal.Value | null | undefined,
) {
  const amount = new Decimal(amountLe).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const fee = amount
    .mul(feePct ?? 0)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_UP);
  return {
    amountLe: amount.toFixed(2),
    feeLe: fee.toFixed(2),
    netLe: amount.minus(fee).toFixed(2),
  };
}

export type GroupFrequency = "WEEKLY" | "MONTHLY";

/** 1-based contribution period that contains `at` (0 before the cycle starts). */
export function periodNumber(cycleStart: Date, frequency: GroupFrequency, at: Date): number {
  if (at < cycleStart) return 0;
  if (frequency === "WEEKLY")
    return Math.floor((at.getTime() - cycleStart.getTime()) / (7 * 86_400_000)) + 1;
  const months =
    (at.getUTCFullYear() - cycleStart.getUTCFullYear()) * 12 +
    (at.getUTCMonth() - cycleStart.getUTCMonth());
  return (at.getUTCDate() >= cycleStart.getUTCDate() ? months : months - 1) + 1;
}

/** Number of periods in a cycle. */
export function totalPeriods(cycleStart: Date, cycleEnd: Date, frequency: GroupFrequency): number {
  return Math.max(1, periodNumber(cycleStart, frequency, new Date(cycleEnd.getTime() - 1)));
}

/**
 * Rotating (Osusu) payout: period n goes to the member with payoutOrder n; if there are more periods
 * than members the rotation starts again. Members without a payout order are skipped.
 */
export function rotatingRecipient<T extends { farmerId: string; payoutOrder: number | null }>(
  members: T[],
  periodNo: number,
): T | null {
  const ordered = members
    .filter((m) => m.payoutOrder != null)
    .sort((a, b) => a.payoutOrder! - b.payoutOrder!);
  if (!ordered.length || periodNo < 1) return null;
  return ordered[(periodNo - 1) % ordered.length] ?? null;
}

/** On-time rate: periods paid ÷ periods elapsed (null if nothing is due yet). */
export function onTimeRate(paidPeriods: number, elapsedPeriods: number): number | null {
  if (elapsedPeriods <= 0) return null;
  return Math.min(1, paidPeriods / elapsedPeriods);
}

/** "On a Le 5,000 sale you'll save Le 750" preview. */
export function autoSavePreview(saleLe: Decimal.Value, pct: Decimal.Value): string {
  return new Decimal(saleLe).mul(pct).div(100).toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2);
}
