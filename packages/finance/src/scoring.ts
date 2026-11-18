import Decimal from "decimal.js";

/**
 * Farm Financial Passport — rule-based credit-readiness score (module 07).
 *
 * `score(inputs, config)` is a pure function: the same inputs and config always give the same result.
 * Fairness: gender, age, disability, ethnicity and location are NEVER inputs — the `ScoreInputs`
 * type has no field for them, so they cannot be used by accident.
 */

export type ScoreBand = "BUILDING" | "FAIR" | "GOOD" | "STRONG";
export const BAND_ORDER: readonly ScoreBand[] = ["BUILDING", "FAIR", "GOOD", "STRONG"];

export type FactorKey =
  | "identity"
  | "coop_standing"
  | "records"
  | "sales"
  | "savings"
  | "repayment"
  | "buyer_relationship";

export interface ScoreInputs {
  /** KYC tier 1–3 (phone only / ID document / NIN verified). */
  kycTier: number;
  coopMember: boolean;
  savingsGroupMember: boolean;
  /** A purchase dispute raised in the last 12 months that is still open. */
  openDisputeLastSeason: boolean;
  /** Farm records per season, split by how they were verified. */
  recordSeasons: { season: string; verified: number; selfReported: number }[];
  /** Value of system-verified sales in the last 12 months (Leones). */
  verifiedSalesLe12m: string;
  /** Distinct calendar months with a verified sale in the last 12 months. */
  saleMonths12m: number;
  harvestLockActive: boolean;
  /** Distinct months with a savings credit in the last 12 months. */
  savingsCreditMonths12m: number;
  /** Share of group contribution periods paid on time (0–1), or null when not in a group. */
  groupOnTimeRate: number | null;
  loans: { repaidOnTime: number; late: number; defaulted: number };
  /** Most seasons sold to the same verified buyer / co-op. */
  repeatBuyerSeasons: number;
}

export interface ScoringConfig {
  modelVersion: string;
  /** Upper bounds (Le) of the sales bands: below [0] → 5 pts, below [1] → 10, below [2] → 15, else 20. */
  salesBandsLe: [number, number, number];
  bands: { fair: number; good: number; strong: number };
}

export const RULES_V1: ScoringConfig = {
  modelVersion: "rules-v1.0",
  salesBandsLe: [1000, 3000, 7000],
  bands: { fair: 40, good: 60, strong: 80 },
};

export interface Factor {
  key: FactorKey;
  points: number;
  max: number;
  /** Short English description of the evidence used (also shown to lenders). */
  evidence: string;
  /** i18n key under `passport.tips` and its parameters; null when the factor is maxed. */
  tip: { key: string; params?: Record<string, string | number> } | null;
}

export interface ScoreResult {
  score: number;
  band: ScoreBand;
  factors: Factor[];
  modelVersion: string;
  flags: string[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function bandFor(score: number, cfg: ScoringConfig = RULES_V1): ScoreBand {
  if (score >= cfg.bands.strong) return "STRONG";
  if (score >= cfg.bands.good) return "GOOD";
  if (score >= cfg.bands.fair) return "FAIR";
  return "BUILDING";
}

export function bandAtLeast(band: ScoreBand | string, min: ScoreBand | string): boolean {
  return (
    BAND_ORDER.indexOf(band as ScoreBand) >= BAND_ORDER.indexOf(min as ScoreBand) &&
    BAND_ORDER.includes(band as ScoreBand)
  );
}

function identity(i: ScoreInputs): Factor {
  const points = i.kycTier >= 3 ? 10 : i.kycTier === 2 ? 7 : 4;
  return {
    key: "identity",
    points,
    max: 10,
    evidence: `KYC tier ${i.kycTier}`,
    tip: points < 10 ? { key: i.kycTier >= 2 ? "addNin" : "addId" } : null,
  };
}

function coopStanding(i: ScoreInputs): Factor {
  const base = i.coopMember ? 10 : i.savingsGroupMember ? 6 : 0;
  const points = clamp(base - (i.openDisputeLastSeason ? 5 : 0), 0, 10);
  const evidence = [
    i.coopMember
      ? "Co-op member"
      : i.savingsGroupMember
        ? "Savings group member"
        : "No co-op or group",
    i.openDisputeLastSeason ? "open sale dispute" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    key: "coop_standing",
    points,
    max: 10,
    evidence,
    tip: i.openDisputeLastSeason
      ? { key: "resolveDispute" }
      : points < 10
        ? { key: i.savingsGroupMember ? "joinCoop" : "joinCoopOrGroup" }
        : null,
  };
}

function records(i: ScoreInputs): Factor {
  // A season counts when it has at least 3 weighted records (verified ×1, self-reported ×0.5).
  const goodSeasons = i.recordSeasons.filter((s) => s.verified + s.selfReported * 0.5 >= 3).length;
  const points = Math.min(goodSeasons * 5, 15);
  return {
    key: "records",
    points,
    max: 15,
    evidence: `${goodSeasons} season(s) with regular records`,
    tip: points < 15 ? { key: "keepRecords", params: { points: Math.min(5, 15 - points) } } : null,
  };
}

function sales(i: ScoreInputs, cfg: ScoringConfig): Factor {
  const v = new Decimal(i.verifiedSalesLe12m || 0);
  const [b1, b2, b3] = cfg.salesBandsLe;
  const band = v.lte(0) ? 0 : v.lt(b1) ? 5 : v.lt(b2) ? 10 : v.lt(b3) ? 15 : 20;
  // Regularity: selling in several months shows steady income (bonus capped at the factor max).
  const bonus = band > 0 ? clamp(i.saleMonths12m - 1, 0, 5) : 0;
  const points = Math.min(band + bonus, 20);
  return {
    key: "sales",
    points,
    max: 20,
    evidence: `Verified sales Le ${v.toFixed(0)} in ${i.saleMonths12m} month(s), last 12 months`,
    tip: points < 20 ? { key: "sellThroughCoop" } : null,
  };
}

function savings(i: ScoreInputs): Factor {
  const lock = i.harvestLockActive ? 5 : 0;
  const months = Math.min(i.savingsCreditMonths12m, 6);
  const group = i.groupOnTimeRate != null && i.groupOnTimeRate >= 0.8 ? 4 : 0;
  const points = lock + months + group;
  return {
    key: "savings",
    points,
    max: 15,
    evidence: [
      i.harvestLockActive ? "Harvest Lock active" : "No Harvest Lock",
      `${i.savingsCreditMonths12m} month(s) with savings`,
      i.groupOnTimeRate != null
        ? `group contributions ${Math.round(i.groupOnTimeRate * 100)}% on time`
        : null,
    ]
      .filter(Boolean)
      .join(", "),
    tip: !i.harvestLockActive
      ? { key: "openHarvestLock" }
      : points < 15
        ? { key: "saveMonthly" }
        : null,
  };
}

function repayment(i: ScoreInputs): { factor: Factor; flags: string[] } {
  const { repaidOnTime, late, defaulted } = i.loans;
  if (defaulted > 0) {
    return {
      factor: {
        key: "repayment",
        points: 0,
        max: 25,
        evidence: `${defaulted} defaulted loan(s)`,
        tip: { key: "clearDefault" },
      },
      flags: ["DEFAULT"],
    };
  }
  const noHistory = repaidOnTime === 0 && late === 0;
  const points = noHistory ? 10 : clamp(10 + repaidOnTime * 5 - late * 5, 0, 25);
  return {
    factor: {
      key: "repayment",
      points,
      max: 25,
      evidence: noHistory
        ? "No loans yet (neutral)"
        : `${repaidOnTime} repaid on time, ${late} late`,
      tip: points < 25 ? { key: noHistory ? "firstLoan" : "repayOnTime" } : null,
    },
    flags: [],
  };
}

function buyerRelationship(i: ScoreInputs): Factor {
  const points = i.repeatBuyerSeasons >= 2 ? 5 : 0;
  return {
    key: "buyer_relationship",
    points,
    max: 5,
    evidence:
      i.repeatBuyerSeasons >= 2
        ? `Sold to the same buyer in ${i.repeatBuyerSeasons} seasons`
        : "No repeat buyer yet",
    tip: points < 5 ? { key: "repeatBuyer" } : null,
  };
}

export function score(inputs: ScoreInputs, cfg: ScoringConfig = RULES_V1): ScoreResult {
  const rep = repayment(inputs);
  const factors = [
    identity(inputs),
    coopStanding(inputs),
    records(inputs),
    sales(inputs, cfg),
    savings(inputs),
    rep.factor,
    buyerRelationship(inputs),
  ];
  const total = clamp(
    factors.reduce((s, f) => s + f.points, 0),
    0,
    100,
  );
  return {
    score: total,
    band: bandFor(total, cfg),
    factors,
    modelVersion: cfg.modelVersion,
    flags: rep.flags,
  };
}

/** Stable JSON (sorted keys) — hash this with the model version for reproducibility. */
export function canonicalInputs(inputs: ScoreInputs): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(inputs));
}
