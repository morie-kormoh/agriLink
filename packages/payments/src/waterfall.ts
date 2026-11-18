import Decimal from "decimal.js";

/**
 * Smart Split waterfall (module 04) — pure, deterministic, no I/O.
 *
 * Given a gross payment and the farmer's active split rules, decide how much goes to
 * each destination (loan repayment, savings, co-op dues, …) and how much reaches the farmer.
 *
 * Guarantees (property-tested):
 *  - the sum of all splits equals the gross amount exactly (2 dp);
 *  - no split is negative;
 *  - the farmer always keeps at least `farmerFloorPct` of the gross;
 *  - loan repayment never takes more than `maxRepaymentPct` of what is left when it applies.
 */

export type SplitType =
  | "LOAN_REPAYMENT"
  | "SAVINGS"
  | "COOP_DUES"
  | "INSURANCE_PREMIUM"
  | "FARMER_WALLET"
  | "DEALER_SETTLEMENT";
export type SplitMode = "PERCENT" | "FIXED" | "OUTSTANDING_BALANCE";

export interface WaterfallRule {
  id: string;
  type: Exclude<SplitType, "FARMER_WALLET" | "DEALER_SETTLEMENT">;
  priority: number;
  mode: SplitMode;
  /** PERCENT: 0–100. FIXED: amount in Leones. Ignored for OUTSTANDING_BALANCE. */
  value?: Decimal.Value | null;
  /** PERCENT of the gross (true) or of what remains after higher-priority rules (false, default). */
  ofGross?: boolean;
  capLe?: Decimal.Value | null;
  /** For OUTSTANDING_BALANCE (loans): what is still owed. */
  outstandingLe?: Decimal.Value | null;
  /** OUTSTANDING_BALANCE: this rule's own cap as % of what remains (e.g. the loan product's limit). Never above the global cap. */
  maxPct?: Decimal.Value | null;
  targetType: string;
  targetId: string;
  label?: string;
}

export interface WaterfallOptions {
  /** Minimum share of the gross the farmer always receives. Default 30. */
  farmerFloorPct?: Decimal.Value;
  /** Max share of the remaining amount a loan repayment may take. Default 60. */
  maxRepaymentPct?: Decimal.Value;
}

export interface SplitPlan {
  order: number;
  type: SplitType;
  amountLe: string;
  targetType: string;
  targetId: string;
  ruleId: string | null;
  explanation: string;
}

export interface WaterfallResult {
  grossLe: string;
  splits: SplitPlan[];
  farmerLe: string;
  deductedLe: string;
  floorApplied: boolean;
}

const TWO_DP = 2;
const floor2 = (d: Decimal) => d.toDecimalPlaces(TWO_DP, Decimal.ROUND_DOWN);
const ceil2 = (d: Decimal) => d.toDecimalPlaces(TWO_DP, Decimal.ROUND_UP);

const LABELS: Record<SplitType, string> = {
  LOAN_REPAYMENT: "Loan repayment",
  SAVINGS: "Savings",
  COOP_DUES: "Co-op dues",
  INSURANCE_PREMIUM: "Insurance premium",
  FARMER_WALLET: "To farmer's wallet",
  DEALER_SETTLEMENT: "Agro-dealer settlement",
};

function money(d: Decimal): string {
  const [i = "0", f] = d.toFixed(2).split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Le ${grouped}${f === "00" ? "" : `.${f}`}`;
}

export function computeWaterfall(
  gross: Decimal.Value,
  rules: WaterfallRule[],
  farmerTarget: { targetType: string; targetId: string },
  options: WaterfallOptions = {},
): WaterfallResult {
  const grossD = new Decimal(gross).toDecimalPlaces(TWO_DP, Decimal.ROUND_HALF_UP);
  if (grossD.isNegative()) throw new Error("Gross amount cannot be negative");
  const floorPct = new Decimal(options.farmerFloorPct ?? 30);
  const maxRepayPct = new Decimal(options.maxRepaymentPct ?? 60);

  let remaining = grossD;
  const deductions: (Omit<SplitPlan, "amountLe" | "order"> & {
    amount: Decimal;
    priority: number;
  })[] = [];

  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const rule of ordered) {
    if (remaining.lte(0)) break;
    const base = rule.ofGross ? grossD : remaining;
    let amount: Decimal;
    let why: string;
    switch (rule.mode) {
      case "PERCENT": {
        const pct = new Decimal(rule.value ?? 0);
        amount = base.mul(pct).div(100);
        why = `${pct.toString()}% of ${money(base)}`;
        break;
      }
      case "FIXED":
        amount = new Decimal(rule.value ?? 0);
        why = `fixed ${money(amount)}`;
        break;
      case "OUTSTANDING_BALANCE": {
        const owed = new Decimal(rule.outstandingLe ?? 0);
        const pct = rule.maxPct != null ? Decimal.min(maxRepayPct, rule.maxPct) : maxRepayPct;
        const cap = remaining.mul(pct).div(100);
        amount = Decimal.min(owed, cap);
        why = owed.gt(cap)
          ? `${pct.toString()}% of ${money(remaining)} (owed ${money(owed)})`
          : `full balance owed`;
        break;
      }
    }
    if (rule.capLe != null) amount = Decimal.min(amount, new Decimal(rule.capLe));
    amount = floor2(Decimal.min(Decimal.max(amount, 0), remaining));
    if (amount.lte(0)) continue;
    remaining = remaining.minus(amount);
    deductions.push({
      type: rule.type,
      amount,
      targetType: rule.targetType,
      targetId: rule.targetId,
      ruleId: rule.id,
      priority: rule.priority,
      explanation: `${rule.label ?? LABELS[rule.type]}: ${why}`,
    });
  }

  // Farmer protection floor: claw back from the lowest-priority deductions first.
  const floorAmt = ceil2(grossD.mul(floorPct).div(100));
  let floorApplied = false;
  if (remaining.lt(floorAmt)) {
    floorApplied = true;
    let need = floorAmt.minus(remaining);
    for (let i = deductions.length - 1; i >= 0 && need.gt(0); i--) {
      const d = deductions[i]!;
      const take = Decimal.min(d.amount, need);
      d.amount = d.amount.minus(take);
      d.explanation += ` (reduced to protect the farmer's ${floorPct.toString()}% minimum)`;
      need = need.minus(take);
      remaining = remaining.plus(take);
    }
  }

  const kept = deductions.filter((d) => d.amount.gt(0));
  const splits: SplitPlan[] = kept.map((d, i) => ({
    order: i + 1,
    type: d.type,
    amountLe: d.amount.toFixed(2),
    targetType: d.targetType,
    targetId: d.targetId,
    ruleId: d.ruleId,
    explanation: d.explanation,
  }));
  splits.push({
    order: splits.length + 1,
    type: "FARMER_WALLET",
    amountLe: remaining.toFixed(2),
    targetType: farmerTarget.targetType,
    targetId: farmerTarget.targetId,
    ruleId: null,
    explanation: `${LABELS.FARMER_WALLET}: ${money(remaining)}`,
  });

  return {
    grossLe: grossD.toFixed(2),
    splits,
    farmerLe: remaining.toFixed(2),
    deductedLe: grossD.minus(remaining).toFixed(2),
    floorApplied,
  };
}

/** Short SMS-friendly breakdown, e.g. "Co-op dues Le 100, Farmer Le 4,900". */
export function summariseSplits(result: WaterfallResult): string {
  return result.splits
    .map(
      (s) =>
        `${s.type === "FARMER_WALLET" ? "You" : LABELS[s.type]} ${money(new Decimal(s.amountLe))}`,
    )
    .join(", ");
}

export { Decimal };
