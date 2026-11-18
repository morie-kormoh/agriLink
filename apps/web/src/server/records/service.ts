import "server-only";
import {
  type Db,
  Prisma,
  type RecordSource,
  type RecordType,
  type Verification,
  prisma,
} from "@agripay/db";
import {
  COST_TYPES,
  INCOME_TYPES,
  type AddRecordInput,
  addRecordSchema,
  currentSeason,
  formatLe,
  updateRecordSchema,
} from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { farmerResource } from "../farmers/scope";
import { sendSms } from "../sms";

export const EDIT_WINDOW_MS = 30 * 24 * 3600 * 1000;

/** Season for a date (co-ops can override by passing an explicit season). */
export function seasonFor(date: Date) {
  return currentSeason(date);
}

async function loadFarmerFor(
  actor: Actor,
  farmerId: string,
  action: "record.create" | "record.read",
) {
  const farmer = await prisma.farmer.findUnique({ where: { id: farmerId } });
  if (!farmer) throw notFound("Farmer");
  const res = farmerResource(farmer);
  const ok =
    actor.role === "SUPER_ADMIN"
      ? can(actor, action)
      : actor.role === "FARMER"
        ? can(actor, action) && actor.farmerId === farmer.id
        : can(actor, action) &&
          ((!!actor.orgId && res.orgId === actor.orgId) ||
            (actor.role === "AGENT" && res.registeredById === actor.userId));
  if (!ok) throw forbidden();
  return farmer;
}

function provenance(actor: Actor): { source: RecordSource; verification: Verification } {
  switch (actor.role) {
    case "FARMER":
      return { source: "APP", verification: "SELF_REPORTED" };
    case "AGENT":
      return { source: "AGENT", verification: "AGENT_CONFIRMED" };
    default:
      return { source: "COOP", verification: "AGENT_CONFIRMED" };
  }
}

export async function addRecord(
  actor: Actor,
  farmerId: string,
  input: AddRecordInput,
  channel?: "USSD",
) {
  const data = addRecordSchema.parse(input);
  const farmer = await loadFarmerFor(actor, farmerId, "record.create");
  // Note: staff record sales through AgriPay as purchases (module 03); a manual SALE is a sale outside AgriPay.
  if (data.cropId) {
    const crop = await prisma.crop.findUnique({ where: { id: data.cropId } });
    if (!crop) throw new AppError("VALIDATION", "Unknown crop.");
  }
  const occurredAt = data.occurredAt ?? new Date();
  const { source, verification } =
    channel === "USSD"
      ? { source: "USSD" as const, verification: "SELF_REPORTED" as const }
      : provenance(actor);
  // Link to the farmer's crop cycle. Harvests and sales belong to the season the crop was planted in
  // (main-season rice is harvested Oct–Dec), so they take the cycle's season unless one is given.
  const dateSeason = data.season ?? seasonFor(occurredAt);
  const cycle = data.cropId
    ? ((await prisma.cropCycle.findFirst({
        where: { cropId: data.cropId, season: dateSeason, plot: { farmerId } },
        orderBy: { createdAt: "desc" },
      })) ??
      (data.type === "HARVEST" || data.type === "SALE"
        ? await prisma.cropCycle.findFirst({
            where: {
              cropId: data.cropId,
              plot: { farmerId },
              createdAt: { gte: new Date(occurredAt.getTime() - 365 * 24 * 3600 * 1000) },
            },
            orderBy: { createdAt: "desc" },
          })
        : null))
    : null;
  const season =
    data.season ??
    (cycle && (data.type === "HARVEST" || data.type === "SALE") ? cycle.season : dateSeason);

  return prisma.$transaction(async (tx) => {
    const rec = await tx.farmRecord.create({
      data: {
        farmerId: farmer.id,
        type: data.type,
        season,
        cropId: data.cropId ?? null,
        cropCycleId: cycle?.id ?? null,
        description: data.description,
        quantity: data.quantity != null ? new Prisma.Decimal(data.quantity) : null,
        unit: data.unit ?? (data.type === "HARVEST" ? "kg" : null),
        amountLe: data.amountLe != null ? new Prisma.Decimal(data.amountLe) : null,
        occurredAt,
        source,
        verification,
        createdById: actor.userId,
      },
    });
    if (data.type === "HARVEST" && cycle && data.quantity != null) {
      await tx.cropCycle.update({
        where: { id: cycle.id },
        // NULL + x is NULL in SQL, so add in code rather than with { increment }.
        data: {
          actualYieldKg: (cycle.actualYieldKg ?? new Prisma.Decimal(0)).plus(data.quantity),
          harvestedAt: cycle.harvestedAt ?? occurredAt,
        },
      });
    }
    await audit(tx, {
      actor,
      action: "record.added",
      entity: "FarmRecord",
      entityId: rec.id,
      after: {
        farmerId,
        type: data.type,
        amountLe: data.amountLe,
        quantity: data.quantity,
        season,
        verification,
      },
    });
    return rec;
  });
}

export async function listRecords(actor: Actor, farmerId: string, season?: string) {
  await loadFarmerFor(actor, farmerId, "record.read");
  return prisma.farmRecord.findMany({
    where: { farmerId, ...(season ? { season } : {}) },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    include: { farmer: { select: { agripayId: true } } },
  });
}

export async function seasonsFor(actor: Actor, farmerId: string): Promise<string[]> {
  await loadFarmerFor(actor, farmerId, "record.read");
  const rows = await prisma.farmRecord.findMany({
    where: { farmerId },
    distinct: ["season"],
    select: { season: true },
  });
  const seasons = new Set([currentSeason(), ...rows.map((r) => r.season)]);
  return [...seasons].sort().reverse();
}

/** Only manual records, by whoever created them (or the farmer for their own self-reported ones), within 30 days. */
async function loadEditable(actor: Actor, id: string) {
  const rec = await prisma.farmRecord.findUnique({ where: { id } });
  if (!rec) throw notFound("Record");
  await loadFarmerFor(actor, rec.farmerId, "record.create");
  if (rec.verification === "SYSTEM_VERIFIED")
    throw new AppError(
      "FORBIDDEN",
      "Automatic records (from purchases or vouchers) can't be changed.",
    );
  if (rec.createdById !== actor.userId)
    throw new AppError("FORBIDDEN", "Only the person who added this record can change it.");
  if (Date.now() - rec.createdAt.getTime() > EDIT_WINDOW_MS)
    throw new AppError("FORBIDDEN", "Records can only be changed within 30 days.");
  return rec;
}

export async function updateRecord(
  actor: Actor,
  id: string,
  input: z.input<typeof updateRecordSchema>,
) {
  const before = await loadEditable(actor, id);
  const data = updateRecordSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const rec = await tx.farmRecord.update({
      where: { id },
      data: {
        description: data.description === undefined ? undefined : data.description,
        quantity:
          data.quantity === undefined
            ? undefined
            : data.quantity == null
              ? null
              : new Prisma.Decimal(data.quantity),
        unit: data.unit === undefined ? undefined : data.unit,
        amountLe:
          data.amountLe === undefined
            ? undefined
            : data.amountLe == null
              ? null
              : new Prisma.Decimal(data.amountLe),
        occurredAt: data.occurredAt,
        season: data.season,
        cropId: data.cropId === undefined ? undefined : data.cropId,
      },
    });
    await audit(tx, {
      actor,
      action: "record.updated",
      entity: "FarmRecord",
      entityId: id,
      before: { amountLe: before.amountLe, quantity: before.quantity },
      after: data,
    });
    return rec;
  });
}

export async function deleteRecord(actor: Actor, id: string) {
  const rec = await loadEditable(actor, id);
  await prisma.$transaction(async (tx) => {
    await tx.farmRecord.delete({ where: { id } });
    await audit(tx, {
      actor,
      action: "record.deleted",
      entity: "FarmRecord",
      entityId: id,
      before: { type: rec.type, amountLe: rec.amountLe, quantity: rec.quantity },
    });
  });
}

// ---------------------------------------------------------------------------
// Automatic records (event consumers) — idempotent via sourceRef
// ---------------------------------------------------------------------------

export async function recordSaleFromPurchase(purchaseId: string) {
  const p = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { crop: true, buyerOrg: true },
  });
  if (!p || p.status === "CANCELLED") return;
  const kg = p.unit === "kg" ? p.quantity : p.unit === "tonne" ? p.quantity.mul(1000) : null;
  await prisma.farmRecord.upsert({
    where: { sourceRef: `purchase:${p.id}` },
    update: {},
    create: {
      farmerId: p.farmerId,
      type: "SALE",
      season:
        (p.cropCycleId
          ? (await prisma.cropCycle.findUnique({ where: { id: p.cropCycleId } }))?.season
          : null) ?? seasonFor(p.recordedAt),
      cropId: p.cropId,
      cropCycleId: p.cropCycleId,
      description: `${p.ref} · sold to ${p.buyerOrg.name} · gross ${formatLe(p.grossLe.toString())}${p.deductionsLe.gt(0) ? `, deductions ${formatLe(p.deductionsLe.toString())}` : ""}`,
      quantity: kg ?? p.quantity,
      unit: kg ? "kg" : p.unit,
      amountLe: p.netLe,
      occurredAt: p.recordedAt,
      source: "AUTO_PURCHASE",
      verification: "SYSTEM_VERIFIED",
      sourceRef: `purchase:${p.id}`,
      createdById: p.recordedById,
    },
  });
}

export async function removeSaleForPurchase(purchaseId: string) {
  await prisma.farmRecord.deleteMany({ where: { sourceRef: `purchase:${purchaseId}` } });
}

// ---------------------------------------------------------------------------
// Season summaries
// ---------------------------------------------------------------------------

export interface SeasonTotals {
  season: string;
  totalCostLe: string;
  totalSalesLe: string;
  netLe: string;
  harvestKg: string;
  recordCount: number;
  verifiedShare: number;
  byType: Record<string, string>;
}

/** Pure aggregation (exported for tests). */
export function summarise(
  season: string,
  records: {
    type: RecordType;
    amountLe: Prisma.Decimal | null;
    quantity: Prisma.Decimal | null;
    unit: string | null;
    verification: Verification;
  }[],
): SeasonTotals {
  const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
  let cost = D(0);
  let sales = D(0);
  let harvest = D(0);
  let saleKg = D(0);
  let verified = D(0);
  const byType: Record<string, Prisma.Decimal> = {};
  for (const r of records) {
    const amt = r.amountLe ?? D(0);
    byType[r.type] = (byType[r.type] ?? D(0)).plus(amt);
    if ((COST_TYPES as readonly string[]).includes(r.type)) cost = cost.plus(amt);
    if ((INCOME_TYPES as readonly string[]).includes(r.type)) sales = sales.plus(amt);
    if (r.type === "HARVEST" && r.quantity && (r.unit ?? "kg") === "kg")
      harvest = harvest.plus(r.quantity);
    if (r.type === "SALE" && r.quantity && r.unit === "kg") saleKg = saleKg.plus(r.quantity);
    if (r.verification === "SYSTEM_VERIFIED") verified = verified.plus(amt);
  }
  const total = cost.plus(sales);
  return {
    season,
    totalCostLe: cost.toFixed(2),
    totalSalesLe: sales.toFixed(2),
    netLe: sales.minus(cost).toFixed(2),
    // If no harvest was recorded, use kilograms sold as the best available estimate.
    harvestKg: (harvest.gt(0) ? harvest : saleKg).toFixed(2),
    recordCount: records.length,
    verifiedShare: total.gt(0) ? Number(verified.div(total).mul(100).toFixed(2)) : 0,
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.toFixed(2)])),
  };
}

export async function computeSeasonTotals(db: Db, farmerId: string, season: string) {
  const recs = await db.farmRecord.findMany({
    where: { farmerId, season },
    select: { type: true, amountLe: true, quantity: true, unit: true, verification: true },
  });
  return summarise(season, recs);
}

export async function getSeasonOverview(actor: Actor, farmerId: string, season = currentSeason()) {
  await loadFarmerFor(actor, farmerId, "record.read");
  const [totals, stored] = await Promise.all([
    computeSeasonTotals(prisma, farmerId, season),
    prisma.seasonSummary.findUnique({ where: { farmerId_season: { farmerId, season } } }),
  ]);
  return { totals, closedAt: stored?.generatedAt ?? null };
}

export async function generateSeasonSummary(db: Db, farmerId: string, season: string) {
  const t = await computeSeasonTotals(db, farmerId, season);
  const data = {
    totalCostLe: new Prisma.Decimal(t.totalCostLe),
    totalSalesLe: new Prisma.Decimal(t.totalSalesLe),
    harvestKg: new Prisma.Decimal(t.harvestKg),
    netLe: new Prisma.Decimal(t.netLe),
    recordCount: t.recordCount,
    verifiedShare: new Prisma.Decimal(t.verifiedShare),
    byType: t.byType,
    generatedAt: new Date(),
  };
  return db.seasonSummary.upsert({
    where: { farmerId_season: { farmerId, season } },
    update: data,
    create: { farmerId, season, ...data },
  });
}

export function summarySms(name: string, t: SeasonTotals) {
  const [year, kind] = t.season.split("-");
  const label = `${year} ${kind === "MAIN" ? "main" : "dry"} season`;
  return `AgriPay ${label}: ${name}, you spent ${formatLe(t.totalCostLe)} and sold ${formatLe(t.totalSalesLe)}${Number(t.harvestKg) > 0 ? ` (${Number(t.harvestKg).toLocaleString("en")}kg)` : ""}. Net ${formatLe(t.netLe)}. Keep recording to grow your AgriPay score.`;
}

/** Co-op admin closes a season: summaries for every member with records, SMS once per farmer. */
export async function closeSeason(actor: Actor, season: string) {
  if (!can(actor, "season.close") || !actor.orgId) throw forbidden();
  const farmers = await prisma.farmer.findMany({
    where: {
      cooperativeId: actor.orgId,
      status: { not: "INACTIVE" },
      records: { some: { season } },
    },
    select: { id: true, fullName: true, phone: true },
  });
  let smsSent = 0;
  for (const f of farmers) {
    const summary = await generateSeasonSummary(prisma, f.id, season);
    if (!summary.smsSentAt) {
      const t = await computeSeasonTotals(prisma, f.id, season);
      await sendSms(f.phone, summarySms(f.fullName.split(" ")[0] ?? f.fullName, t), "general");
      await prisma.seasonSummary.update({
        where: { id: summary.id },
        data: { smsSentAt: new Date() },
      });
      smsSent++;
    }
  }
  await audit(prisma, {
    actor,
    action: "season.closed",
    entity: "Organization",
    entityId: actor.orgId,
    after: { season, farmers: farmers.length, smsSent },
  });
  return { season, farmers: farmers.length, smsSent };
}

export async function coopSeasonTable(actor: Actor, season: string) {
  if (!can(actor, "record.read") || !actor.orgId) throw forbidden();
  const farmers = await prisma.farmer.findMany({
    where: {
      cooperativeId: actor.orgId,
      status: { not: "INACTIVE" },
      records: { some: { season } },
    },
    select: { id: true, agripayId: true, fullName: true, gender: true },
    orderBy: { fullName: "asc" },
  });
  const summaries = await prisma.seasonSummary.findMany({
    where: { season, farmerId: { in: farmers.map((f) => f.id) } },
  });
  const sByFarmer = new Map(summaries.map((s) => [s.farmerId, s]));
  return Promise.all(
    farmers.map(async (f) => ({
      farmer: f,
      totals: await computeSeasonTotals(prisma, f.id, season),
      closed: sByFarmer.get(f.id) ?? null,
    })),
  );
}
