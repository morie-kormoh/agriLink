import { z } from "zod";
import { RecordType } from "@agrilink/db/enums";
import { moneyLe } from "./money";
import { seasonCode } from "./common";

export const COST_TYPES = [
  "INPUT_PURCHASE",
  "LABOUR",
  "LAND_PREP",
  "TRANSPORT",
  "OTHER_COST",
] as const;
export const INCOME_TYPES = ["SALE", "OTHER_INCOME"] as const;

const base = z.object({
  type: z.enum(RecordType),
  season: seasonCode.optional(),
  cropId: z.string().optional().nullable(),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  quantity: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : Number(v)))
    .pipe(z.union([z.null(), z.number().positive().max(10_000_000)])),
  unit: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  amountLe: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v))
    .pipe(z.union([z.null(), moneyLe])),
  occurredAt: z.coerce.date().optional(),
});

/** Per-type rules: costs and income need an amount; harvests need a quantity. */
export const addRecordSchema = base.superRefine((v, ctx) => {
  if (v.type === "HARVEST") {
    if (v.quantity == null)
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Enter the harvest quantity" });
  } else if (v.amountLe == null || Number(v.amountLe) <= 0) {
    ctx.addIssue({ code: "custom", path: ["amountLe"], message: "Enter the amount" });
  }
  if (v.occurredAt && v.occurredAt.getTime() > Date.now() + 24 * 3600 * 1000) {
    ctx.addIssue({ code: "custom", path: ["occurredAt"], message: "Date cannot be in the future" });
  }
});
export type AddRecordInput = z.input<typeof addRecordSchema>;

export const updateRecordSchema = base.partial().omit({ type: true });

export const closeSeasonSchema = z.object({ season: seasonCode });
