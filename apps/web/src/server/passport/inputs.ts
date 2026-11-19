import "server-only";
import { type Db, Prisma } from "@agrilink/db";
import {
  type GroupFrequency,
  type ScoreInputs,
  periodNumber,
  totalPeriods,
} from "@agrilink/finance";
import { seasonFor } from "../records/service";

const YEAR = 365 * 86_400_000;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;

/**
 * Gather the facts the score uses. Only behaviour on the platform — never gender, age, disability,
 * ethnicity or location (see packages/finance/src/scoring.ts).
 */
export async function buildScoreInputs(
  db: Db,
  farmerId: string,
  now = new Date(),
): Promise<ScoreInputs> {
  const since = new Date(now.getTime() - YEAR);
  const farmer = await db.farmer.findUniqueOrThrow({
    where: { id: farmerId },
    select: { kycTier: true, cooperativeId: true },
  });

  const [memberships, openDisputes, records, paidSales, lockAccounts, savingsCredits, loans] =
    await Promise.all([
      db.savingsGroupMember.findMany({ where: { farmerId }, include: { group: true } }),
      db.purchase.count({ where: { farmerId, status: "DISPUTED", disputedAt: { gte: since } } }),
      db.farmRecord.groupBy({ by: ["season", "verification"], where: { farmerId }, _count: true }),
      db.purchase.findMany({
        where: { farmerId, status: "PAID" },
        select: { netLe: true, recordedAt: true, buyerOrgId: true },
      }),
      db.savingsAccount.count({
        where: {
          farmerId,
          status: "ACTIVE",
          autoSavePaused: false,
          product: { type: "HARVEST_LOCK" },
        },
      }),
      db.savingsTransaction.findMany({
        where: {
          account: { farmerId },
          type: { in: ["CREDIT_AUTO", "CREDIT_MANUAL"] },
          createdAt: { gte: since },
        },
        select: { createdAt: true },
      }),
      db.loan.findMany({ where: { farmerId }, select: { status: true, lateAt: true } }),
    ]);

  // Records per season, split by verification.
  const seasons = new Map<string, { season: string; verified: number; selfReported: number }>();
  for (const r of records) {
    const s = seasons.get(r.season) ?? { season: r.season, verified: 0, selfReported: 0 };
    if (r.verification === "SELF_REPORTED") s.selfReported += r._count;
    else s.verified += r._count;
    seasons.set(r.season, s);
  }

  // Verified sales = purchases actually paid through AgriLink.
  const recent = paidSales.filter((p) => p.recordedAt >= since);
  const salesLe = recent.reduce((s, p) => s.plus(p.netLe), new Prisma.Decimal(0));
  const saleMonths = new Set(recent.map((p) => monthKey(p.recordedAt))).size;
  const seasonsByBuyer = new Map<string, Set<string>>();
  for (const p of paidSales) {
    const set = seasonsByBuyer.get(p.buyerOrgId) ?? new Set<string>();
    set.add(seasonFor(p.recordedAt));
    seasonsByBuyer.set(p.buyerOrgId, set);
  }

  // Group contributions on time = periods paid ÷ periods elapsed, across the farmer's groups.
  let paid = 0;
  let elapsed = 0;
  for (const m of memberships) {
    const g = m.group;
    const freq = g.frequency as GroupFrequency;
    const due = Math.min(
      periodNumber(g.cycleStart, freq, now),
      totalPeriods(g.cycleStart, g.cycleEnd, freq),
    );
    if (due <= 0) continue;
    const periods = await db.groupContribution.findMany({
      where: { groupId: g.id, farmerId, periodNo: { lte: due } },
      select: { periodNo: true },
      distinct: ["periodNo"],
    });
    paid += periods.length;
    elapsed += due;
  }

  return {
    kycTier: farmer.kycTier,
    coopMember: !!farmer.cooperativeId,
    savingsGroupMember: memberships.length > 0,
    openDisputeLastSeason: openDisputes > 0,
    recordSeasons: [...seasons.values()].sort((a, b) => a.season.localeCompare(b.season)),
    verifiedSalesLe12m: salesLe.toFixed(2),
    saleMonths12m: saleMonths,
    harvestLockActive: lockAccounts > 0,
    savingsCreditMonths12m: new Set(savingsCredits.map((c) => monthKey(c.createdAt))).size,
    groupOnTimeRate: elapsed > 0 ? Math.min(1, paid / elapsed) : null,
    loans: {
      repaidOnTime: loans.filter((l) => l.status === "REPAID" && !l.lateAt).length,
      late: loans.filter((l) => l.lateAt && l.status !== "DEFAULTED" && l.status !== "WRITTEN_OFF")
        .length,
      defaulted: loans.filter((l) => l.status === "DEFAULTED" || l.status === "WRITTEN_OFF").length,
    },
    repeatBuyerSeasons: Math.max(0, ...[...seasonsByBuyer.values()].map((s) => s.size)),
  };
}
