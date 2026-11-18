import { z } from "zod";

export const idParam = z.string().min(1).max(64);

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof pagination>;

export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Season code, e.g. 2027-MAIN or 2027-DRY. */
export const seasonCode = z.string().regex(/^\d{4}-(MAIN|DRY)$/, "Season must look like 2027-MAIN");

export function currentSeason(date = new Date()): string {
  // Main (rainy) season planting roughly May–Oct; dry season Nov–Apr.
  const m = date.getUTCMonth() + 1;
  const y = date.getUTCFullYear();
  if (m >= 5 && m <= 10) return `${y}-MAIN`;
  return m >= 11 ? `${y}-DRY` : `${y - 1}-DRY`;
}

/** Youth = 18–35 (national youth policy definition). */
export function isYouth(dateOfBirth: Date | null | undefined, at = new Date()): boolean {
  if (!dateOfBirth) return false;
  const age = ageInYears(dateOfBirth, at);
  return age >= 18 && age <= 35;
}

export function ageInYears(dateOfBirth: Date, at = new Date()): number {
  let age = at.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const m = at.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < dateOfBirth.getUTCDate())) age--;
  return age;
}
