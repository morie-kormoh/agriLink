import { describe, expect, it } from "vitest";
import fc from "fast-check";
import Decimal from "decimal.js";
import { type WaterfallRule, computeWaterfall, summariseSplits } from "../waterfall";

const FARMER = { targetType: "WALLET", targetId: "w1" };
const dues = (pct: number, priority = 3): WaterfallRule => ({
  id: "dues",
  type: "COOP_DUES",
  priority,
  mode: "PERCENT",
  value: pct,
  targetType: "COOPERATIVE",
  targetId: "c1",
});
const savings = (pct: number, priority = 2, ofGross = false): WaterfallRule => ({
  id: "sav",
  type: "SAVINGS",
  priority,
  mode: "PERCENT",
  value: pct,
  ofGross,
  targetType: "SAVINGS_ACCOUNT",
  targetId: "s1",
});
const loan = (owed: number, priority = 1): WaterfallRule => ({
  id: "loan",
  type: "LOAN_REPAYMENT",
  priority,
  mode: "OUTSTANDING_BALANCE",
  outstandingLe: owed,
  targetType: "LOAN",
  targetId: "l1",
});

const amounts = (r: ReturnType<typeof computeWaterfall>) =>
  Object.fromEntries(r.splits.map((s) => [s.type, s.amountLe]));

describe("computeWaterfall — table", () => {
  it("no rules → everything to the farmer", () => {
    const r = computeWaterfall("5000", [], FARMER);
    expect(r.splits).toHaveLength(1);
    expect(r.farmerLe).toBe("5000.00");
  });

  it("concept-note example: loan, 15% savings, dues", () => {
    const r = computeWaterfall(
      "5000",
      [loan(1200), savings(15), { ...dues(0), mode: "FIXED", value: 50 }],
      FARMER,
    );
    expect(amounts(r)).toEqual({
      LOAN_REPAYMENT: "1200.00",
      SAVINGS: "570.00",
      COOP_DUES: "50.00",
      FARMER_WALLET: "3180.00",
    });
    expect(r.splits.map((s) => s.order)).toEqual([1, 2, 3, 4]);
  });

  it("loan larger than the payment is capped at 60% of what remains", () => {
    const r = computeWaterfall("1000", [loan(5000)], FARMER);
    expect(amounts(r)).toEqual({ LOAN_REPAYMENT: "600.00", FARMER_WALLET: "400.00" });
  });

  it("respects a custom max repayment share", () => {
    const r = computeWaterfall("1000", [loan(5000)], FARMER, { maxRepaymentPct: 40 });
    expect(r.farmerLe).toBe("600.00");
  });

  it("protects the farmer's 30% floor by trimming the lowest-priority deductions first", () => {
    const r = computeWaterfall("1000", [loan(5000), savings(50), dues(50)], FARMER);
    // loan 600 → remaining 400; savings 200 → 200; dues 100 → 100 (< floor 300) → claw back 200: dues 100→0, savings 200→100
    expect(amounts(r)).toEqual({
      LOAN_REPAYMENT: "600.00",
      SAVINGS: "100.00",
      FARMER_WALLET: "300.00",
    });
    expect(r.floorApplied).toBe(true);
    expect(r.splits.find((s) => s.type === "SAVINGS")?.explanation).toMatch(/minimum/);
  });

  it("percent of gross vs percent of remaining", () => {
    const ofRemaining = computeWaterfall("1000", [loan(500), savings(10)], FARMER);
    const ofGross = computeWaterfall("1000", [loan(500), savings(10, 2, true)], FARMER);
    expect(amounts(ofRemaining).SAVINGS).toBe("50.00");
    expect(amounts(ofGross).SAVINGS).toBe("100.00");
  });

  it("caps a split and skips zero amounts", () => {
    const r = computeWaterfall("10000", [{ ...savings(20), capLe: 500 }, dues(0)], FARMER);
    expect(amounts(r)).toEqual({ SAVINGS: "500.00", FARMER_WALLET: "9500.00" });
  });

  it("rounds deductions down so the remainder goes to the farmer", () => {
    const r = computeWaterfall("333.33", [dues(3)], FARMER);
    expect(amounts(r)).toEqual({ COOP_DUES: "9.99", FARMER_WALLET: "323.34" });
  });

  it("fixed amount larger than the payment is limited by the floor", () => {
    const r = computeWaterfall("100", [{ ...dues(0), mode: "FIXED", value: 500 }], FARMER);
    expect(amounts(r)).toEqual({ COOP_DUES: "70.00", FARMER_WALLET: "30.00" });
  });

  it("zero payment", () => {
    const r = computeWaterfall("0", [dues(5)], FARMER);
    expect(r.splits).toEqual([
      expect.objectContaining({ type: "FARMER_WALLET", amountLe: "0.00" }),
    ]);
  });

  it("rejects negative amounts", () => {
    expect(() => computeWaterfall("-1", [], FARMER)).toThrow();
  });

  it("orders by priority regardless of input order", () => {
    const r = computeWaterfall("1000", [dues(10, 3), loan(100, 1), savings(10, 2)], FARMER);
    expect(r.splits.map((s) => s.type)).toEqual([
      "LOAN_REPAYMENT",
      "SAVINGS",
      "COOP_DUES",
      "FARMER_WALLET",
    ]);
  });

  it("summarises for SMS", () => {
    const r = computeWaterfall("5000", [dues(2)], FARMER);
    expect(summariseSplits(r)).toBe("Co-op dues Le 100, You Le 4,900");
  });
});

describe("computeWaterfall — properties", () => {
  const ruleArb = fc.oneof(
    fc.record({
      mode: fc.constant("PERCENT" as const),
      value: fc.integer({ min: 0, max: 100 }),
      ofGross: fc.boolean(),
    }),
    fc.record({
      mode: fc.constant("FIXED" as const),
      value: fc.integer({ min: 0, max: 100_000 }),
      ofGross: fc.constant(false),
    }),
    fc.record({
      mode: fc.constant("OUTSTANDING_BALANCE" as const),
      value: fc.integer({ min: 0, max: 100_000 }),
      ofGross: fc.constant(false),
    }),
  );
  const types = ["LOAN_REPAYMENT", "SAVINGS", "COOP_DUES", "INSURANCE_PREMIUM"] as const;

  it("splits always sum to gross, never go negative, and respect the farmer floor", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }).map((c) => (c / 100).toFixed(2)),
        fc.array(ruleArb, { maxLength: 5 }),
        fc.integer({ min: 0, max: 100 }),
        (gross, rawRules, floorPct) => {
          const rules: WaterfallRule[] = rawRules.map((r, i) => ({
            id: `r${i}`,
            type: types[i % types.length]!,
            priority: i + 1,
            mode: r.mode,
            value: r.mode === "OUTSTANDING_BALANCE" ? null : r.value,
            outstandingLe: r.mode === "OUTSTANDING_BALANCE" ? r.value : null,
            ofGross: r.ofGross,
            targetType: "X",
            targetId: `t${i}`,
          }));
          const res = computeWaterfall(gross, rules, FARMER, { farmerFloorPct: floorPct });
          const sum = res.splits.reduce((s, x) => s.plus(x.amountLe), new Decimal(0));
          expect(sum.toFixed(2)).toBe(new Decimal(gross).toFixed(2));
          for (const s of res.splits) expect(new Decimal(s.amountLe).gte(0)).toBe(true);
          const floor = new Decimal(gross)
            .mul(floorPct)
            .div(100)
            .toDecimalPlaces(2, Decimal.ROUND_UP);
          expect(new Decimal(res.farmerLe).gte(Decimal.min(floor, gross))).toBe(true);
          expect(res.splits.at(-1)?.type).toBe("FARMER_WALLET");
        },
      ),
      { numRuns: 500 },
    );
  });
  it("a loan rule's own cap (product max % per sale) applies below the global cap", () => {
    const r = computeWaterfall(
      "1000",
      [
        {
          id: "l",
          type: "LOAN_REPAYMENT",
          priority: 1,
          mode: "OUTSTANDING_BALANCE",
          outstandingLe: "5000",
          maxPct: "40",
          targetType: "LOAN",
          targetId: "loan",
        },
      ],
      { targetType: "WALLET", targetId: "w" },
    );
    expect(r.splits[0]!.amountLe).toBe("400.00");
    const r2 = computeWaterfall(
      "1000",
      [
        {
          id: "l",
          type: "LOAN_REPAYMENT",
          priority: 1,
          mode: "OUTSTANDING_BALANCE",
          outstandingLe: "5000",
          maxPct: "90",
          targetType: "LOAN",
          targetId: "loan",
        },
      ],
      { targetType: "WALLET", targetId: "w" },
    );
    expect(r2.splits[0]!.amountLe).toBe("600.00");
  });
});
