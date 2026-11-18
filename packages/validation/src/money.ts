import Decimal from "decimal.js";
import { z } from "zod";

/**
 * Money is Sierra Leone Leone (SLE). Never use JS `number` arithmetic for money:
 * use these helpers (decimal.js) and store as Decimal(14,2) in Postgres.
 */
export type MoneyInput = Decimal.Value | { toString(): string };

export function toDecimal(value: MoneyInput): Decimal {
  return new Decimal(
    typeof value === "object" && !(value instanceof Decimal) ? value.toString() : value,
  );
}

export function roundMoney(value: MoneyInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0));
}

/** "Le 4,000" / "Le 4,000.50" — whole Leones shown without decimals. */
export function formatLe(value: MoneyInput): string {
  const d = roundMoney(value);
  const negative = d.isNegative();
  const abs = d.abs();
  const whole = abs.isInteger();
  const [intPart = "0", frac] = abs.toFixed(whole ? 0 : 2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}Le ${grouped}${frac ? `.${frac}` : ""}`;
}

/** Zod schema: accepts "4000", "4,000", 4000 → string with 2dp, must be ≥ 0. */
export const moneyLe = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const raw = typeof v === "number" ? String(v) : v.replace(/[,\s]/g, "").replace(/^Le/i, "");
  try {
    const d = new Decimal(raw);
    if (d.isNegative()) {
      ctx.addIssue({ code: "custom", message: "Amount cannot be negative" });
      return z.NEVER;
    }
    return d.toFixed(2);
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
    return z.NEVER;
  }
});

export { Decimal };
