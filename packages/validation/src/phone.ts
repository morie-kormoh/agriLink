import { z } from "zod";

/**
 * Sierra Leone phone numbers.
 * Accepts: "076 123456", "076123456", "76123456", "+232 76 123456", "23276123456", "0023276123456".
 * Normalises to E.164: "+23276123456".
 */
export function normalizeSlPhone(input: string): string | null {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("00232")) digits = digits.slice(5);
  else if (digits.startsWith("232") && digits.length === 11) digits = digits.slice(3);
  else if (digits.startsWith("0") && digits.length === 9) digits = digits.slice(1);
  if (!/^[2-9]\d{7}$/.test(digits)) return null;
  return `+232${digits}`;
}

export const phoneSL = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((value, ctx) => {
    const normalised = normalizeSlPhone(value);
    if (!normalised) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Sierra Leone phone number" });
      return z.NEVER;
    }
    return normalised;
  });

export type MobileOperator = "ORANGE" | "AFRICELL" | "QCELL" | "UNKNOWN";

/**
 * Best-effort operator detection from the 2-digit prefix.
 * Prefix allocations change — verify against NatCA's numbering plan before using this for routing.
 */
const PREFIXES: Record<Exclude<MobileOperator, "UNKNOWN">, string[]> = {
  ORANGE: ["72", "73", "75", "76", "78", "79"],
  AFRICELL: ["30", "33", "34", "77", "80", "88", "99"],
  QCELL: ["31", "32", "35"],
};

export function operatorFromPhone(e164: string): MobileOperator {
  const prefix = e164.replace("+232", "").slice(0, 2);
  for (const [op, list] of Object.entries(PREFIXES)) {
    if (list.includes(prefix)) return op as MobileOperator;
  }
  return "UNKNOWN";
}

/** "+23276123456" → "076 123 456" for display. */
export function formatSlPhone(e164: string): string {
  const national = e164.replace(/^\+232/, "");
  if (national.length !== 8) return e164;
  return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}

/** Mask for logs and lists: "+23276***456". */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return "***";
  return `${e164.slice(0, 6)}***${e164.slice(-3)}`;
}
