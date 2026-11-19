import type { Db } from "./client";

/**
 * Atomically increments and returns the next value of a named counter.
 * Safe under concurrency: a single INSERT … ON CONFLICT … RETURNING statement.
 */
export async function nextSequenceValue(db: Db, key: string): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "IdSequence" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "IdSequence"."value" + 1
    RETURNING "value"
  `;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error(`Failed to allocate sequence value for ${key}`);
  return Number(value);
}

/** AgriLink farmer ID, e.g. AP-BOM-000123 (never reused). */
export async function nextFarmerId(db: Db, districtCode: string): Promise<string> {
  const code = districtCode.toUpperCase();
  const n = await nextSequenceValue(db, `farmer:${code}`);
  return `AP-${code}-${String(n).padStart(6, "0")}`;
}
