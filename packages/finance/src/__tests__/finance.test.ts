import { randomBytes } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  RULES_V1,
  type ScoreInputs,
  affordability,
  arrearsTransition,
  autoSavePreview,
  bandAtLeast,
  bandFor,
  canonicalInputs,
  disclosure,
  earlyWithdrawalFee,
  eligibility,
  formatVoucherCode,
  generateVoucherCode,
  graduationLimit,
  isValidVoucherCode,
  loanCost,
  loanDueDate,
  nextReleaseDate,
  normalizeVoucherCode,
  onTimeRate,
  periodNumber,
  rotatingRecipient,
  score,
  totalPeriods,
} from "../index";

const base: ScoreInputs = {
  kycTier: 1,
  coopMember: false,
  savingsGroupMember: false,
  openDisputeLastSeason: false,
  recordSeasons: [],
  verifiedSalesLe12m: "0",
  saleMonths12m: 0,
  harvestLockActive: false,
  savingsCreditMonths12m: 0,
  groupOnTimeRate: null,
  loans: { repaidOnTime: 0, late: 0, defaulted: 0 },
  repeatBuyerSeasons: 0,
};
const pts = (i: Partial<ScoreInputs>, key: string) =>
  score({ ...base, ...i }).factors.find((f) => f.key === key)!.points;

describe("scoring factors", () => {
  it("identity by KYC tier", () => {
    expect(pts({ kycTier: 1 }, "identity")).toBe(4);
    expect(pts({ kycTier: 2 }, "identity")).toBe(7);
    expect(pts({ kycTier: 3 }, "identity")).toBe(10);
  });
  it("co-op standing with dispute penalty", () => {
    expect(pts({ coopMember: true }, "coop_standing")).toBe(10);
    expect(pts({ savingsGroupMember: true }, "coop_standing")).toBe(6);
    expect(pts({}, "coop_standing")).toBe(0);
    expect(pts({ coopMember: true, openDisputeLastSeason: true }, "coop_standing")).toBe(5);
    expect(pts({ openDisputeLastSeason: true }, "coop_standing")).toBe(0);
  });
  it("records: seasons with ≥3 weighted records, self-reported count half", () => {
    expect(
      pts({ recordSeasons: [{ season: "2026-MAIN", verified: 3, selfReported: 0 }] }, "records"),
    ).toBe(5);
    expect(
      pts({ recordSeasons: [{ season: "2026-MAIN", verified: 0, selfReported: 5 }] }, "records"),
    ).toBe(0);
    expect(
      pts({ recordSeasons: [{ season: "2026-MAIN", verified: 1, selfReported: 4 }] }, "records"),
    ).toBe(5);
    const four = ["2024-MAIN", "2024-DRY", "2025-MAIN", "2025-DRY"].map((season) => ({
      season,
      verified: 3,
      selfReported: 0,
    }));
    expect(pts({ recordSeasons: four }, "records")).toBe(15);
  });
  it("sales bands at boundaries + regularity bonus capped at 20", () => {
    expect(pts({ verifiedSalesLe12m: "0" }, "sales")).toBe(0);
    expect(pts({ verifiedSalesLe12m: "999.99", saleMonths12m: 1 }, "sales")).toBe(5);
    expect(pts({ verifiedSalesLe12m: "1000", saleMonths12m: 1 }, "sales")).toBe(10);
    expect(pts({ verifiedSalesLe12m: "2999", saleMonths12m: 1 }, "sales")).toBe(10);
    expect(pts({ verifiedSalesLe12m: "3000", saleMonths12m: 1 }, "sales")).toBe(15);
    expect(pts({ verifiedSalesLe12m: "7000", saleMonths12m: 1 }, "sales")).toBe(20);
    expect(pts({ verifiedSalesLe12m: "3000", saleMonths12m: 4 }, "sales")).toBe(18);
    expect(pts({ verifiedSalesLe12m: "7000", saleMonths12m: 12 }, "sales")).toBe(20);
  });
  it("savings: lock 5 + months (max 6) + group ≥80% → 4", () => {
    expect(pts({ harvestLockActive: true }, "savings")).toBe(5);
    expect(pts({ harvestLockActive: true, savingsCreditMonths12m: 9 }, "savings")).toBe(11);
    expect(
      pts({ harvestLockActive: true, savingsCreditMonths12m: 6, groupOnTimeRate: 0.8 }, "savings"),
    ).toBe(15);
    expect(pts({ groupOnTimeRate: 0.79 }, "savings")).toBe(0);
  });
  it("repayment: neutral 10, +5 on time, −5 late, default → 0 + flag", () => {
    expect(pts({}, "repayment")).toBe(10);
    expect(pts({ loans: { repaidOnTime: 1, late: 0, defaulted: 0 } }, "repayment")).toBe(15);
    expect(pts({ loans: { repaidOnTime: 5, late: 0, defaulted: 0 } }, "repayment")).toBe(25);
    expect(pts({ loans: { repaidOnTime: 0, late: 3, defaulted: 0 } }, "repayment")).toBe(0);
    const r = score({ ...base, loans: { repaidOnTime: 4, late: 0, defaulted: 1 } });
    expect(r.factors.find((f) => f.key === "repayment")!.points).toBe(0);
    expect(r.flags).toContain("DEFAULT");
  });
  it("buyer relationship needs 2 seasons", () => {
    expect(pts({ repeatBuyerSeasons: 1 }, "buyer_relationship")).toBe(0);
    expect(pts({ repeatBuyerSeasons: 2 }, "buyer_relationship")).toBe(5);
  });
  it("bands at boundaries", () => {
    expect([0, 39, 40, 59, 60, 79, 80, 100].map((s) => bandFor(s))).toEqual([
      "BUILDING",
      "BUILDING",
      "FAIR",
      "FAIR",
      "GOOD",
      "GOOD",
      "STRONG",
      "STRONG",
    ]);
    expect(bandAtLeast("GOOD", "FAIR")).toBe(true);
    expect(bandAtLeast("FAIR", "GOOD")).toBe(false);
  });
  it("is deterministic, bounded and every factor has points ≤ max (property)", () => {
    const arb = fc.record({
      kycTier: fc.integer({ min: 1, max: 3 }),
      coopMember: fc.boolean(),
      savingsGroupMember: fc.boolean(),
      openDisputeLastSeason: fc.boolean(),
      recordSeasons: fc.array(
        fc.record({
          season: fc.constantFrom("2025-MAIN", "2025-DRY", "2026-MAIN"),
          verified: fc.nat(10),
          selfReported: fc.nat(10),
        }),
        { maxLength: 6 },
      ),
      verifiedSalesLe12m: fc.integer({ min: 0, max: 50_000 }).map(String),
      saleMonths12m: fc.integer({ min: 0, max: 12 }),
      harvestLockActive: fc.boolean(),
      savingsCreditMonths12m: fc.integer({ min: 0, max: 12 }),
      groupOnTimeRate: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
      loans: fc.record({ repaidOnTime: fc.nat(6), late: fc.nat(4), defaulted: fc.nat(1) }),
      repeatBuyerSeasons: fc.nat(5),
    });
    fc.assert(
      fc.property(arb, (i) => {
        const a = score(i);
        const b = score(JSON.parse(JSON.stringify(i)));
        expect(a).toEqual(b);
        expect(a.score).toBeGreaterThanOrEqual(0);
        expect(a.score).toBeLessThanOrEqual(100);
        for (const f of a.factors) expect(f.points).toBeLessThanOrEqual(f.max);
        expect(a.factors.reduce((s, f) => s + f.max, 0)).toBe(100);
      }),
      { numRuns: 300 },
    );
  });
  it("canonical inputs ignore key order; model version is recorded", () => {
    const reordered = Object.fromEntries(Object.entries(base).reverse()) as ScoreInputs;
    expect(canonicalInputs(reordered)).toBe(canonicalInputs(base));
    expect(score(base).modelVersion).toBe(RULES_V1.modelVersion);
  });
  it("has no protected-attribute inputs", () => {
    for (const k of Object.keys(base))
      expect(k).not.toMatch(/gender|sex|age|birth|disab|ethnic|district|chiefdom|location/i);
  });
});

describe("credit rules", () => {
  it("loan cost", () => {
    expect(loanCost("2000", "10")).toEqual({
      principalLe: "2000.00",
      feeLe: "200.00",
      totalLe: "2200.00",
    });
  });
  it("graduation raises the limit by 50% per on-time cycle, capped", () => {
    const p = { firstCycleMaxLe: "1000", maxAmountLe: "3000" };
    expect(graduationLimit({ ...p, onTimeCycles: 0 })).toBe("1000.00");
    expect(graduationLimit({ ...p, onTimeCycles: 1 })).toBe("1500.00");
    expect(graduationLimit({ ...p, onTimeCycles: 2 })).toBe("2250.00");
    expect(graduationLimit({ ...p, onTimeCycles: 3 })).toBe("3000.00");
  });
  it("affordability uses the lower of verified sales and projection; nothing without sales", () => {
    const a = affordability({
      verifiedSalesLe: "5000",
      expectedYieldKg: "800",
      pricePerKgLe: "4",
      maxDebtToIncomePct: "40",
      flatFeePct: "10",
    });
    expect(a).toMatchObject({
      expectedSalesLe: "3200.00",
      basis: "EXPECTED_YIELD",
      maxTotalDueLe: "1280.00",
      maxPrincipalLe: "1163.63",
    });
    expect(
      affordability({ verifiedSalesLe: "5000", maxDebtToIncomePct: "40", flatFeePct: "10" })
        .maxTotalDueLe,
    ).toBe("2000.00");
    expect(
      affordability({
        verifiedSalesLe: "0",
        expectedYieldKg: "800",
        pricePerKgLe: "4",
        maxDebtToIncomePct: "40",
        flatFeePct: "10",
      }).basis,
    ).toBe("NONE");
  });
  it("eligibility reasons", () => {
    const ok = {
      productActive: true,
      minBand: "FAIR",
      band: "GOOD" as const,
      hasConsent: true,
      consentRequired: true,
      hasActiveLoan: false,
      hasDefaultedLoan: false,
      productCropIds: ["rice"],
      farmerCropIds: ["rice"],
      productDistrictIds: [],
      farmerDistrictId: "bom",
      hasWallet: true,
      requiresGroup: false,
      inSavingsGroup: false,
      minAmountLe: "500",
      graduationLimitLe: "1000",
      affordablePrincipalLe: "1500",
    };
    expect(eligibility(ok)).toEqual({ eligible: true, reasons: [], limitLe: "1000.00" });
    expect(eligibility({ ...ok, affordablePrincipalLe: "800" }).limitLe).toBe("800.00");
    expect(eligibility({ ...ok, band: "BUILDING" }).reasons).toEqual(["BAND_TOO_LOW"]);
    expect(eligibility({ ...ok, hasConsent: false }).reasons).toEqual(["NO_CONSENT"]);
    expect(eligibility({ ...ok, hasConsent: false, consentRequired: false }).eligible).toBe(true);
    expect(eligibility({ ...ok, hasDefaultedLoan: true, hasActiveLoan: true }).reasons).toEqual([
      "DEFAULTED_LOAN",
    ]);
    expect(eligibility({ ...ok, farmerCropIds: ["cocoa"] }).reasons).toEqual(["CROP_MISMATCH"]);
    expect(eligibility({ ...ok, productDistrictIds: ["ken"] }).reasons).toEqual([
      "DISTRICT_MISMATCH",
    ]);
    expect(eligibility({ ...ok, affordablePrincipalLe: "100" }).reasons).toEqual([
      "NOT_AFFORDABLE",
    ]);
    expect(eligibility({ ...ok, requiresGroup: true }).reasons).toEqual(["GROUP_REQUIRED"]);
  });
  it("due dates", () => {
    expect(loanDueDate("05-30", new Date("2026-11-17T10:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2027-05-30",
    );
    expect(loanDueDate("01-10", new Date("2026-12-01T00:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2028-01-10",
    ); // < 60 days away
    expect(loanDueDate(null, new Date("2026-01-01T00:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2026-06-30",
    );
  });
  it("arrears: LATE only after 14 days with a balance; default possible after 90", () => {
    const due = new Date("2027-05-30T00:00:00Z");
    const at = (d: number) => new Date(due.getTime() + d * 86_400_000);
    expect(
      arrearsTransition({ status: "REPAYING", dueDate: due, outstandingLe: "10", now: at(14) })
        .next,
    ).toBeNull();
    expect(
      arrearsTransition({ status: "REPAYING", dueDate: due, outstandingLe: "10", now: at(15) })
        .next,
    ).toBe("LATE");
    expect(
      arrearsTransition({ status: "REPAYING", dueDate: due, outstandingLe: "0", now: at(40) }).next,
    ).toBeNull();
    expect(
      arrearsTransition({ status: "LATE", dueDate: due, outstandingLe: "10", now: at(40) }).next,
    ).toBeNull();
    expect(
      arrearsTransition({ status: "LATE", dueDate: due, outstandingLe: "10", now: at(90) })
        .canDefault,
    ).toBe(false);
    expect(
      arrearsTransition({ status: "LATE", dueDate: due, outstandingLe: "10", now: at(91) })
        .canDefault,
    ).toBe(true);
  });
  it("disclosure states amount, fee, total, cap and due date in both languages", () => {
    const d = {
      lenderName: "Rokel CB",
      productName: "Rice inputs",
      principalLe: "2000",
      flatFeePct: "10",
      maxRepaymentPctPerSale: "50",
      dueDate: new Date("2027-05-30T00:00:00Z"),
      voucherValidDays: 60,
    };
    const en = disclosure(d).text;
    for (const s of ["Le 2,000", "Le 200", "Le 2,200", "50%", "30 May 2027", "24 hours"])
      expect(en).toContain(s);
    expect(disclosure(d, "kri").text).toContain("Le 2,200");
  });
});

describe("savings rules", () => {
  it("next release date", () => {
    expect(
      nextReleaseDate("04-01", new Date("2026-11-17T00:00:00Z")).toISOString().slice(0, 10),
    ).toBe("2027-04-01");
    expect(
      nextReleaseDate("04-01", new Date("2027-04-01T00:00:00Z")).toISOString().slice(0, 10),
    ).toBe("2028-04-01");
    expect(
      nextReleaseDate("12-01", new Date("2026-11-17T00:00:00Z")).toISOString().slice(0, 10),
    ).toBe("2026-12-01");
  });
  it("early withdrawal fee rounds up, net = amount − fee", () => {
    expect(earlyWithdrawalFee("1000", "5")).toEqual({
      amountLe: "1000.00",
      feeLe: "50.00",
      netLe: "950.00",
    });
    expect(earlyWithdrawalFee("333", "3")).toEqual({
      amountLe: "333.00",
      feeLe: "9.99",
      netLe: "323.01",
    });
    expect(earlyWithdrawalFee("100", null).feeLe).toBe("0.00");
    expect(earlyWithdrawalFee("101", "2.5").feeLe).toBe("2.53"); // 2.525 rounds up
  });
  it("periods and rotating payout order", () => {
    const start = new Date("2026-01-05T00:00:00Z");
    expect(periodNumber(start, "WEEKLY", new Date("2026-01-04T00:00:00Z"))).toBe(0);
    expect(periodNumber(start, "WEEKLY", new Date("2026-01-11T23:00:00Z"))).toBe(1);
    expect(periodNumber(start, "WEEKLY", new Date("2026-01-12T00:00:00Z"))).toBe(2);
    expect(periodNumber(start, "MONTHLY", new Date("2026-02-04T00:00:00Z"))).toBe(1);
    expect(periodNumber(start, "MONTHLY", new Date("2026-02-05T00:00:00Z"))).toBe(2);
    expect(totalPeriods(start, new Date("2027-01-05T00:00:00Z"), "MONTHLY")).toBe(12);
    const members = [
      { farmerId: "c", payoutOrder: 3 },
      { farmerId: "a", payoutOrder: 1 },
      { farmerId: "x", payoutOrder: null },
      { farmerId: "b", payoutOrder: 2 },
    ];
    expect([1, 2, 3, 4].map((p) => rotatingRecipient(members, p)?.farmerId)).toEqual([
      "a",
      "b",
      "c",
      "a",
    ]);
    expect(rotatingRecipient([], 1)).toBeNull();
    expect(onTimeRate(4, 5)).toBe(0.8);
    expect(onTimeRate(0, 0)).toBeNull();
    expect(autoSavePreview("5000", "15")).toBe("750.00");
  });
});

describe("voucher codes", () => {
  it("generates valid 8-char codes and forgives O/I/L, case and dashes", () => {
    for (let i = 0; i < 500; i++) {
      const c = generateVoucherCode((n) => randomBytes(n));
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
      expect(isValidVoucherCode(c)).toBe(true);
      expect(isValidVoucherCode(formatVoucherCode(c).toLowerCase())).toBe(true);
    }
    expect(normalizeVoucherCode("ko1l-oi2x")).toBe("K011012X");
  });
  it("detects single-character typos", () => {
    const c = generateVoucherCode((n) => randomBytes(n));
    let detected = 0;
    let total = 0;
    for (let i = 0; i < 8; i++) {
      for (const ch of "0123456789ABCDEFGHJKMNPQRSTVWXYZ") {
        if (ch === c[i]) continue;
        total++;
        if (!isValidVoucherCode(c.slice(0, i) + ch + c.slice(i + 1))) detected++;
      }
    }
    expect(detected / total).toBeGreaterThan(0.95);
  });
});
