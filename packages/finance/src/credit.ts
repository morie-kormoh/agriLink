import Decimal from "decimal.js";
import { type ScoreBand, bandAtLeast } from "./scoring";

/**
 * Responsible-lending rules (module 08) — pure functions shared by the web app, API, USSD and worker.
 */

const floor2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_DOWN);
const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function money(v: Decimal.Value): string {
  const [i = "0", f] = new Decimal(v).toFixed(2).split(".");
  return `Le ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f === "00" ? "" : `.${f}`}`;
}

/** Fee and total for a simple flat-fee loan (the only pricing AgriLink supports: easy to explain). */
export function loanCost(principalLe: Decimal.Value, flatFeePct: Decimal.Value) {
  const principal = round2(new Decimal(principalLe));
  const fee = round2(principal.mul(flatFeePct).div(100));
  return {
    principalLe: principal.toFixed(2),
    feeLe: fee.toFixed(2),
    totalLe: principal.plus(fee).toFixed(2),
  };
}

/**
 * Graduation: the first loan with a lender is capped at `firstCycleMaxLe`; each loan repaid on time
 * raises the limit by `graduationPct` (compounding) up to `maxAmountLe`.
 */
export function graduationLimit(p: {
  firstCycleMaxLe: Decimal.Value;
  maxAmountLe: Decimal.Value;
  graduationPct?: Decimal.Value;
  onTimeCycles: number;
}): string {
  const step = new Decimal(1).plus(new Decimal(p.graduationPct ?? 50).div(100));
  const limit = new Decimal(p.firstCycleMaxLe).mul(step.pow(Math.max(0, p.onTimeCycles)));
  return floor2(Decimal.min(limit, p.maxAmountLe)).toFixed(2);
}

export interface AffordabilityInput {
  /** Verified sales in the last 12 months (Le). */
  verifiedSalesLe: Decimal.Value;
  /** Expected harvest for the coming season (kg), if recorded. */
  expectedYieldKg?: Decimal.Value | null;
  /** Co-op / buyer price per kg for the main crop, if known. */
  pricePerKgLe?: Decimal.Value | null;
  maxDebtToIncomePct: Decimal.Value;
  flatFeePct: Decimal.Value;
}

export interface Affordability {
  expectedSalesLe: string;
  basis: "VERIFIED_SALES" | "EXPECTED_YIELD" | "NONE";
  maxTotalDueLe: string;
  maxPrincipalLe: string;
}

/**
 * Total to repay must not exceed `maxDebtToIncomePct` of expected harvest sales, where expected sales is the
 * LOWER of last year's verified sales and expected yield × price (when both are known).
 */
export function affordability(a: AffordabilityInput): Affordability {
  const verified = new Decimal(a.verifiedSalesLe || 0);
  const projected =
    a.expectedYieldKg != null && a.pricePerKgLe != null
      ? new Decimal(a.expectedYieldKg).mul(a.pricePerKgLe)
      : null;
  let expected: Decimal;
  let basis: Affordability["basis"];
  if (verified.gt(0) && projected && projected.gt(0)) {
    expected = Decimal.min(verified, projected);
    basis = expected.eq(verified) ? "VERIFIED_SALES" : "EXPECTED_YIELD";
  } else if (verified.gt(0)) {
    expected = verified;
    basis = "VERIFIED_SALES";
  } else {
    // Without any verified sales history we do not lend on projections alone.
    expected = new Decimal(0);
    basis = "NONE";
  }
  const maxTotal = floor2(expected.mul(a.maxDebtToIncomePct).div(100));
  const maxPrincipal = floor2(
    maxTotal.div(new Decimal(1).plus(new Decimal(a.flatFeePct).div(100))),
  );
  return {
    expectedSalesLe: round2(expected).toFixed(2),
    basis,
    maxTotalDueLe: maxTotal.toFixed(2),
    maxPrincipalLe: maxPrincipal.toFixed(2),
  };
}

export type IneligibleReason =
  | "NO_CONSENT"
  | "NO_SCORE"
  | "BAND_TOO_LOW"
  | "ACTIVE_LOAN"
  | "DEFAULTED_LOAN"
  | "CROP_MISMATCH"
  | "DISTRICT_MISMATCH"
  | "NOT_AFFORDABLE"
  | "NO_WALLET"
  | "GROUP_REQUIRED"
  | "PRODUCT_INACTIVE";

export interface EligibilityInput {
  productActive: boolean;
  minBand: ScoreBand | string;
  band: ScoreBand | null;
  hasConsent: boolean;
  /** Consent may be granted as part of applying; lender offers need it up front. */
  consentRequired: boolean;
  hasActiveLoan: boolean;
  hasDefaultedLoan: boolean;
  productCropIds: string[];
  farmerCropIds: string[];
  productDistrictIds: string[];
  farmerDistrictId: string;
  hasWallet: boolean;
  requiresGroup: boolean;
  inSavingsGroup: boolean;
  minAmountLe: Decimal.Value;
  graduationLimitLe: Decimal.Value;
  affordablePrincipalLe: Decimal.Value;
}

export interface Eligibility {
  eligible: boolean;
  reasons: IneligibleReason[];
  /** Largest amount the farmer can borrow now (0 when not eligible). */
  limitLe: string;
}

export function eligibility(e: EligibilityInput): Eligibility {
  const reasons: IneligibleReason[] = [];
  if (!e.productActive) reasons.push("PRODUCT_INACTIVE");
  if (e.consentRequired && !e.hasConsent) reasons.push("NO_CONSENT");
  if (!e.band) reasons.push("NO_SCORE");
  else if (!bandAtLeast(e.band, e.minBand)) reasons.push("BAND_TOO_LOW");
  if (e.hasDefaultedLoan) reasons.push("DEFAULTED_LOAN");
  else if (e.hasActiveLoan) reasons.push("ACTIVE_LOAN");
  if (e.productCropIds.length && !e.farmerCropIds.some((c) => e.productCropIds.includes(c)))
    reasons.push("CROP_MISMATCH");
  if (e.productDistrictIds.length && !e.productDistrictIds.includes(e.farmerDistrictId))
    reasons.push("DISTRICT_MISMATCH");
  if (!e.hasWallet) reasons.push("NO_WALLET");
  if (e.requiresGroup && !e.inSavingsGroup) reasons.push("GROUP_REQUIRED");
  const limit = floor2(Decimal.min(e.graduationLimitLe, e.affordablePrincipalLe));
  if (limit.lt(e.minAmountLe)) reasons.push("NOT_AFFORDABLE");
  return {
    eligible: reasons.length === 0,
    reasons,
    limitLe: reasons.length ? "0.00" : limit.toFixed(2),
  };
}

/** Next date with the given MM-DD that is at least `minDays` after `from` (UTC midnight). */
export function nextMonthDay(monthDay: string, from: Date, minDays = 0): Date {
  const [mm, dd] = monthDay.split("-").map(Number) as [number, number];
  const earliest = new Date(from.getTime() + minDays * 86_400_000);
  for (let y = earliest.getUTCFullYear(); y <= earliest.getUTCFullYear() + 2; y++) {
    const d = new Date(Date.UTC(y, mm - 1, dd));
    if (d.getTime() > earliest.getTime()) return d;
  }
  throw new Error(`Invalid month-day ${monthDay}`);
}

/** Loan due date: product fallback date (≥ 60 days away) or 180 days after disbursement. */
export function loanDueDate(dueMonthDay: string | null | undefined, disbursedAt: Date): Date {
  if (dueMonthDay) return nextMonthDay(dueMonthDay, disbursedAt, 60);
  const d = new Date(disbursedAt.getTime() + 180 * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const LATE_AFTER_DAYS = 14;
export const DEFAULT_ELIGIBLE_AFTER_DAYS = 90;

export function daysPastDue(dueDate: Date | null, now: Date): number {
  if (!dueDate) return 0;
  return Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000));
}

/**
 * Arrears transition: a loan with money still owed becomes LATE 14 days after its due date.
 * Defaults are never automatic — after 90 days the lender may mark it DEFAULTED.
 */
export function arrearsTransition(p: {
  status: string;
  dueDate: Date | null;
  outstandingLe: Decimal.Value;
  now: Date;
}): { next: "LATE" | null; daysPastDue: number; canDefault: boolean } {
  const dpd = daysPastDue(p.dueDate, p.now);
  const owing = new Decimal(p.outstandingLe).gt(0);
  const active = ["DISBURSED", "REPAYING", "RESTRUCTURED"].includes(p.status);
  return {
    next: active && owing && dpd > LATE_AFTER_DAYS ? "LATE" : null,
    daysPastDue: dpd,
    canDefault: owing && (p.status === "LATE" || active) && dpd > DEFAULT_ELIGIBLE_AFTER_DAYS,
  };
}

export interface DisclosureInput {
  lenderName: string;
  productName: string;
  principalLe: Decimal.Value;
  flatFeePct: Decimal.Value;
  maxRepaymentPctPerSale: Decimal.Value;
  dueDate: Date;
  voucherValidDays: number;
}

/** Plain-language loan disclosure, identical in the app and on USSD. */
export function disclosure(d: DisclosureInput, locale: "en" | "kri" = "en") {
  const c = loanCost(d.principalLe, d.flatFeePct);
  const due = d.dueDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const pct = new Decimal(d.maxRepaymentPctPerSale).toString();
  const lines =
    locale === "kri"
      ? [
          `${d.lenderName}: ${d.productName}`,
          `Yu go get input voucher fɔ ${money(c.principalLe)}.`,
          `Fi: ${money(c.feeLe)}. Ɔl wetin yu fɔ pe bak: ${money(c.totalLe)}.`,
          `Wi go tek ap to ${pct}% pan ɛni sel we yu sel tru AgriLink te yu dɔn pe.`,
          `Las de fɔ pe: ${due}.`,
          `If yu lɛt pas 14 de, yu skɔ go go dɔŋ. Nɔ ɛni ɔda chaj.`,
          `Yu kin kansl insay 24 awa if yu nɔ yuz di voucher yet.`,
        ]
      : [
          `${d.lenderName}: ${d.productName}`,
          `You receive an input voucher worth ${money(c.principalLe)} (valid ${d.voucherValidDays} days).`,
          `Fee: ${money(c.feeLe)}. Total to repay: ${money(c.totalLe)}.`,
          `Repayment: up to ${pct}% of each sale paid through AgriLink until repaid. You always keep at least 30%.`,
          `Due date: ${due}.`,
          `If you are more than 14 days late your AgriLink score goes down. There are no extra charges.`,
          `You can cancel within 24 hours if you have not used the voucher.`,
        ];
  return { ...c, dueDate: d.dueDate.toISOString(), lines, text: lines.join("\n") };
}
