import "server-only";
import type { Db } from "@agripay/db";

export type DuplicateReason = "SAME_NIN" | "SAME_PHONE_SIMILAR_NAME" | "SIMILAR_NAME_SAME_CHIEFDOM";

export interface DuplicateCandidate {
  id: string;
  agripayId: string;
  fullName: string;
  phone: string;
  reason: DuplicateReason;
  score: number;
}

export interface DuplicateCheckInput {
  phone: string;
  nin: string | null;
  fullName: string;
  dateOfBirth: Date | null;
  chiefdomId: string;
  excludeId?: string;
}

export const NAME_SIMILARITY_WITH_PHONE = 0.6;
export const NAME_SIMILARITY_SAME_CHIEFDOM = 0.8;

/**
 * Duplicate detection rules (module 02):
 *  - same NIN                                   → duplicate
 *  - same phone and name similarity ≥ 0.6       → duplicate (otherwise just a shared phone)
 *  - name similarity > 0.8 in the same chiefdom → duplicate when DOBs match or either is missing
 * Uses pg_trgm `similarity()` backed by the GIN trigram index on Farmer.fullName.
 */
export async function findDuplicateCandidates(
  db: Db,
  input: DuplicateCheckInput,
): Promise<{
  candidates: DuplicateCandidate[];
  phoneTakenByOther: boolean;
  ninTaken: boolean;
}> {
  const exclude = input.excludeId ?? "";
  const candidates = new Map<string, DuplicateCandidate>();
  let ninTaken = false;

  if (input.nin) {
    const byNin = await db.farmer.findFirst({
      where: { nin: input.nin, id: { not: exclude } },
      select: { id: true, agripayId: true, fullName: true, phone: true },
    });
    if (byNin) {
      ninTaken = true;
      candidates.set(byNin.id, { ...byNin, reason: "SAME_NIN", score: 1 });
    }
  }

  const samePhone = await db.$queryRaw<
    { id: string; agripayId: string; fullName: string; phone: string; score: number }[]
  >`
    SELECT "id", "agripayId", "fullName", "phone",
           similarity(lower("fullName"), lower(${input.fullName}))::float8 AS score
    FROM "Farmer"
    WHERE "phone" = ${input.phone} AND "id" <> ${exclude} AND "status" <> 'INACTIVE'
  `;
  for (const row of samePhone) {
    if (row.score >= NAME_SIMILARITY_WITH_PHONE && !candidates.has(row.id)) {
      candidates.set(row.id, { ...row, reason: "SAME_PHONE_SIMILAR_NAME", score: row.score });
    }
  }

  const similarNames = await db.$queryRaw<
    {
      id: string;
      agripayId: string;
      fullName: string;
      phone: string;
      dateOfBirth: Date | null;
      score: number;
    }[]
  >`
    SELECT "id", "agripayId", "fullName", "phone", "dateOfBirth",
           similarity(lower("fullName"), lower(${input.fullName}))::float8 AS score
    FROM "Farmer"
    WHERE "chiefdomId" = ${input.chiefdomId}
      AND "id" <> ${exclude}
      AND "status" <> 'INACTIVE'
      AND "fullName" % ${input.fullName}
    ORDER BY score DESC
    LIMIT 10
  `;
  for (const row of similarNames) {
    if (row.score <= NAME_SIMILARITY_SAME_CHIEFDOM || candidates.has(row.id)) continue;
    const dobCompatible =
      !input.dateOfBirth ||
      !row.dateOfBirth ||
      row.dateOfBirth.toISOString().slice(0, 10) === input.dateOfBirth.toISOString().slice(0, 10);
    if (dobCompatible) {
      candidates.set(row.id, {
        id: row.id,
        agripayId: row.agripayId,
        fullName: row.fullName,
        phone: row.phone,
        reason: "SIMILAR_NAME_SAME_CHIEFDOM",
        score: row.score,
      });
    }
  }

  return {
    candidates: [...candidates.values()].sort((a, b) => b.score - a.score),
    phoneTakenByOther: samePhone.length > 0,
    ninTaken,
  };
}
