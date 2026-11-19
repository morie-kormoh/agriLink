import { z } from "zod";
import { BuyerType, MobileMoneyProvider } from "@agrilink/db/enums";
import { moneyLe } from "./money";

/** Positive money amount as a 2-dp string. */
export const positiveMoney = moneyLe.refine((v) => Number(v) > 0, "Must be more than 0");

const optionalMoney = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : v))
  .pipe(z.union([z.null(), moneyLe]));

export const DEDUCTION_TYPES = ["TRANSPORT", "BAGS", "QUALITY", "OTHER"] as const;

export const deductionSchema = z.object({
  type: z.enum(DEDUCTION_TYPES),
  amountLe: positiveMoney,
  note: z.string().trim().max(120).optional().nullable(),
});

export const recordPurchaseSchema = z.object({
  clientRef: z.uuid().optional().nullable(),
  farmerId: z.string().min(1, "Select the farmer"),
  cropId: z.string().min(1, "Select the crop"),
  grade: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  quantity: z.coerce.number().positive("Quantity must be more than 0").max(1_000_000),
  unit: z.enum(["kg", "bag", "tonne"]).default("kg"),
  bags: z.coerce.number().int().min(0).max(100_000).optional().nullable(),
  /** Leave empty to use the active price list */
  unitPriceLe: optionalMoney,
  priceOverrideReason: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  deductions: z.array(deductionSchema).max(10).default([]),
  collectionPointId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  latitude: z.number().min(6.8).max(10.1).optional().nullable(),
  longitude: z.number().min(-13.4).max(-10.2).optional().nullable(),
});
export type RecordPurchaseInput = z.input<typeof recordPurchaseSchema>;
export type RecordPurchaseData = z.output<typeof recordPurchaseSchema>;

export const setPriceSchema = z.object({
  cropId: z.string().min(1),
  grade: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  unit: z.enum(["kg", "bag", "tonne"]).default("kg"),
  priceLe: positiveMoney,
});

export const coopSettingsSchema = z.object({
  registrationNo: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  mainCrops: z.array(z.string()).max(20).default([]),
  duesPct: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : Number(v)))
    .pipe(z.union([z.null(), z.number().min(0).max(20, "Dues cannot be more than 20%")])),
  duesFlatLe: optionalMoney,
  approvalThresholdLe: optionalMoney,
  fundingProvider: z.enum(MobileMoneyProvider).optional().nullable(),
  fundingAccount: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const buyerSettingsSchema = z.object({
  type: z.enum(BuyerType),
  crops: z.array(z.string()).max(20).default([]),
  approvalThresholdLe: optionalMoney,
  fundingProvider: z.enum(MobileMoneyProvider).optional().nullable(),
  fundingAccount: z
    .string()
    .trim()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const collectionPointSchema = z.object({
  name: z.string().trim().min(2).max(80),
  community: z.string().trim().min(2).max(80),
  districtId: z.string().optional().nullable(),
  latitude: z.number().min(6.8).max(10.1).optional().nullable(),
  longitude: z.number().min(-13.4).max(-10.2).optional().nullable(),
});

export const cancelPurchaseSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(200),
});

export const acknowledgeSchema = z.object({
  reply: z.enum(["1", "2"]),
  reason: z.string().trim().max(200).optional().nullable(),
  purchaseRef: z.string().optional().nullable(),
});

export const resolveDisputeSchema = z.object({
  outcome: z.enum(["UPHOLD", "REJECT"]),
  note: z.string().trim().min(3).max(300),
});

export const listPurchasesSchema = z.object({
  status: z
    .enum([
      "RECORDED",
      "APPROVED",
      "PAYMENT_PENDING",
      "PAID",
      "PAYMENT_FAILED",
      "DISPUTED",
      "CANCELLED",
    ])
    .optional(),
  batchId: z.string().optional(),
  farmerId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const previewWaterfallSchema = z.object({
  farmerId: z.string().min(1),
  grossLe: positiveMoney,
});
