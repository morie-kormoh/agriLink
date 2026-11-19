import { z } from "zod";
import { MobileMoneyProvider } from "@agrilink/db/enums";
import { moneyLe } from "./money";
import { positiveMoney } from "./trade";

/** The farmer's existing PIN, entered to confirm a financial decision. */
export const pinEntry = z.string().regex(/^\d{4,5}$/, "Enter your 4–5 digit PIN");

const pct = (min = 0, max = 100) =>
  z.coerce
    .number()
    .min(min)
    .max(max)
    .transform((n) => n.toFixed(2));
const monthDay = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use MM-DD, e.g. 04-01");
const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const optMoney = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : v))
  .pipe(z.union([z.null(), moneyLe]));

// ---------------------------------------------------------------------------
// Financial institutions (lenders & savings custodians)
// ---------------------------------------------------------------------------

export const institutionSettingsSchema = z.object({
  licenceNo: optText(60),
  fundingProvider: z
    .enum(MobileMoneyProvider)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  fundingAccount: optText(40),
  collectionAccount: optText(40),
  savingsAccount: optText(40),
  approvalThresholdLe: positiveMoney,
});
export type InstitutionSettingsInput = z.input<typeof institutionSettingsSchema>;

// ---------------------------------------------------------------------------
// Module 06 — Savings
// ---------------------------------------------------------------------------

export const SAVINGS_TYPES = ["HARVEST_LOCK", "GOAL"] as const;

export const savingsProductSchema = z
  .object({
    name: text(80),
    type: z.enum(SAVINGS_TYPES),
    defaultPct: pct(0, 50).optional().nullable(),
    minPct: pct(0, 50).optional().nullable(),
    maxPct: pct(0, 50).optional().nullable(),
    releaseRule: z.enum(["FIXED_DATE", "SEASON_START", "GOAL_REACHED"]),
    releaseMonthDay: monthDay.optional().nullable(),
    earlyWithdrawalAllowed: z.boolean().default(true),
    earlyWithdrawalFeePct: pct(0, 10).optional().nullable(),
    interestNote: optText(300),
  })
  .refine((p) => p.releaseRule === "GOAL_REACHED" || !!p.releaseMonthDay, {
    message: "Set the release date (MM-DD)",
    path: ["releaseMonthDay"],
  })
  .refine(
    (p) =>
      p.type !== "HARVEST_LOCK" ||
      (p.minPct != null && p.maxPct != null && Number(p.minPct) <= Number(p.maxPct)),
    {
      message: "Harvest Lock needs a minimum and maximum % (min ≤ max)",
      path: ["maxPct"],
    },
  );
export type SavingsProductInput = z.input<typeof savingsProductSchema>;

export const openHarvestLockSchema = z.object({
  productId: z.string().min(1),
  pct: z.coerce.number().min(1).max(50),
  pin: pinEntry,
});
export type OpenHarvestLockInput = z.input<typeof openHarvestLockSchema>;

export const openGoalSchema = z.object({
  productId: z.string().min(1),
  goalLabel: text(60),
  goalLe: positiveMoney,
  pct: z.coerce.number().min(1).max(50),
  pin: pinEntry,
});

export const updateAutoSaveSchema = z.object({
  pct: z.coerce.number().min(1).max(50).optional(),
  paused: z.boolean().optional(),
  pin: pinEntry,
});

export const earlyWithdrawalSchema = z.object({ amountLe: positiveMoney, pin: pinEntry });

export const GROUP_TYPES = ["VSLA", "OSUSU_ROTATING", "GOAL"] as const;
export const GROUP_ROLES = ["CHAIR", "TREASURER", "SECRETARY", "MEMBER"] as const;

export const createGroupSchema = z
  .object({
    name: text(80),
    type: z.enum(GROUP_TYPES),
    contributionLe: positiveMoney,
    frequency: z.enum(["WEEKLY", "MONTHLY"]),
    cycleStart: z.coerce.date(),
    cycleEnd: z.coerce.date(),
  })
  .refine((g) => g.cycleEnd > g.cycleStart, {
    message: "Cycle end must be after the start",
    path: ["cycleEnd"],
  });
export type CreateGroupInput = z.input<typeof createGroupSchema>;

export const addGroupMemberSchema = z.object({
  farmerId: z.string().min(1),
  role: z.enum(GROUP_ROLES).default("MEMBER"),
  payoutOrder: z.coerce.number().int().min(1).max(500).optional().nullable(),
  guarantor: z.boolean().default(false),
});

export const recordContributionSchema = z.object({
  farmerId: z.string().min(1),
  periodNo: z.coerce.number().int().min(1).max(520),
  amountLe: positiveMoney,
  method: z.enum(["MOBILE_MONEY", "CASH_RECORDED"]),
  reference: optText(60),
});

export const recordPayoutSchema = z.object({
  periodNo: z.coerce.number().int().min(1).max(520),
  method: z.enum(["MOBILE_MONEY", "CASH_RECORDED"]),
});

// ---------------------------------------------------------------------------
// Module 07 — Passport & consent
// ---------------------------------------------------------------------------

export const CONSENT_SCOPES = ["PASSPORT_SUMMARY", "PASSPORT_DETAILED", "RECORDS_FULL"] as const;

export const requestConsentSchema = z.object({
  /** AgriLink ID (AP-BOM-000123) or phone — lenders cannot browse farmers. */
  farmer: text(40),
  scope: z.enum(CONSENT_SCOPES),
  purpose: text(160),
  durationMonths: z.coerce.number().int().min(1).max(24).default(12),
});
export type RequestConsentInput = z.input<typeof requestConsentSchema>;

export const respondConsentSchema = z.object({
  decision: z.enum(["GRANT", "DECLINE"]),
  pin: pinEntry,
});
export const revokeConsentSchema = z.object({ pin: pinEntry });

// ---------------------------------------------------------------------------
// Module 08 — Credit & vouchers
// ---------------------------------------------------------------------------

export const INPUT_CATEGORIES = ["SEED", "FERTILISER", "AGROCHEM", "TOOLS"] as const;

export const loanProductSchema = z
  .object({
    name: text(80),
    description: optText(300),
    purpose: z.enum(["INPUTS", "EQUIPMENT", "IRRIGATION"]).default("INPUTS"),
    cropIds: z.array(z.string()).max(30).default([]),
    districtIds: z.array(z.string()).max(20).default([]),
    minAmountLe: positiveMoney,
    maxAmountLe: positiveMoney,
    firstCycleMaxLe: positiveMoney,
    graduationPct: pct(0, 200).default("50.00"),
    flatFeePct: pct(0, 40),
    minBand: z.enum(["BUILDING", "FAIR", "GOOD", "STRONG"]).default("FAIR"),
    maxDebtToIncomePct: pct(5, 60).default("40.00"),
    dueMonthDay: monthDay.optional().nullable(),
    maxRepaymentPctPerSale: pct(5, 60).default("60.00"),
    requiresGroupGuarantee: z.boolean().default(false),
    voucherValidDays: z.coerce.number().int().min(7).max(180).default(60),
    allowedCategories: z.array(z.enum(INPUT_CATEGORIES)).default([]),
    eligibleDealerIds: z.array(z.string()).max(50).default([]),
    active: z.boolean().default(true),
  })
  .refine(
    (p) =>
      Number(p.minAmountLe) <= Number(p.firstCycleMaxLe) &&
      Number(p.firstCycleMaxLe) <= Number(p.maxAmountLe),
    {
      message: "Amounts must satisfy minimum ≤ first-loan maximum ≤ maximum",
      path: ["firstCycleMaxLe"],
    },
  );
export type LoanProductInput = z.input<typeof loanProductSchema>;

export const disclosurePreviewSchema = z.object({
  productId: z.string().min(1),
  amountLe: positiveMoney,
});

export const applyLoanSchema = z.object({
  productId: z.string().min(1),
  amountLe: positiveMoney,
  pin: pinEntry,
});
export type ApplyLoanInput = z.input<typeof applyLoanSchema>;

export const makeOfferSchema = z.object({
  farmerId: z.string().min(1),
  productId: z.string().min(1),
  amountLe: positiveMoney,
});
export const acceptLoanSchema = z.object({ pin: pinEntry });
export const declineLoanSchema = z.object({ reason: text(200) });
export const markDefaultSchema = z.object({ reason: text(200) });
export const restructureSchema = z.object({ dueDate: z.coerce.date(), reason: text(200) });
export const manualRepaymentSchema = z.object({ amountLe: positiveMoney, reference: text(60) });

export const dealerProfileSchema = z.object({
  districtId: z.string().min(1),
  payoutMsisdn: z.string().min(6).max(20),
  payoutProvider: z.enum(MobileMoneyProvider),
});
export type DealerProfileInput = z.input<typeof dealerProfileSchema>;

export const dealerItemSchema = z.object({
  name: text(80),
  category: z.enum(INPUT_CATEGORIES),
  unit: z.string().trim().min(1).max(20).default("each"),
  unitPriceLe: positiveMoney,
  active: z.boolean().default(true),
});
export type DealerItemInput = z.input<typeof dealerItemSchema>;

export const redemptionItemsSchema = z
  .array(z.object({ itemId: z.string().min(1), qty: z.coerce.number().int().min(1).max(1000) }))
  .min(1)
  .max(20);

export const redemptionOtpSchema = z.object({ code: text(12), items: redemptionItemsSchema });
export const redeemVoucherSchema = z.object({
  code: text(12),
  items: redemptionItemsSchema,
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code the farmer received"),
  clientRef: z.uuid().optional().nullable(),
});
export type RedeemVoucherInput = z.input<typeof redeemVoucherSchema>;

export const portfolioFilterSchema = z.object({
  districtId: z.string().optional(),
  cropId: z.string().optional(),
  productId: z.string().optional(),
});

/** Months (MM-DD) used by forms. */
export const optionalMonthDay = monthDay.optional().nullable();
export { optMoney as optionalMoneyInput };
