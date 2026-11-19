import "server-only";
import { type Db, Prisma, prisma } from "@agrilink/db";
import {
  buyerSettingsSchema,
  collectionPointSchema,
  coopSettingsSchema,
  setPriceSchema,
} from "@agrilink/validation";
import { type Actor, can } from "@agrilink/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";

export type TradeOrgKind = "COOPERATIVE" | "BUYER";

/** The trading organisation an actor works for (co-op or buyer), or throws. */
export async function tradeOrg(
  actor: Actor,
): Promise<{ id: string; name: string; kind: TradeOrgKind }> {
  if (!actor.orgId) throw forbidden("You need to act for a cooperative or buyer.");
  const org = await prisma.organization.findUnique({ where: { id: actor.orgId } });
  if (!org || (org.type !== "COOPERATIVE" && org.type !== "BUYER"))
    throw forbidden("Only cooperatives and buyers record purchases.");
  return { id: org.id, name: org.name, kind: org.type };
}

export async function getTradeSettings(actor: Actor) {
  const org = await tradeOrg(actor);
  if (org.kind === "COOPERATIVE") {
    const s = await prisma.cooperative.upsert({
      where: { orgId: org.id },
      update: {},
      create: { orgId: org.id },
    });
    return { org, kind: "COOPERATIVE" as const, coop: s, buyer: null };
  }
  const s = await prisma.buyer.upsert({
    where: { orgId: org.id },
    update: {},
    create: { orgId: org.id },
  });
  return { org, kind: "BUYER" as const, coop: null, buyer: s };
}

export async function updateCoopSettings(actor: Actor, input: z.input<typeof coopSettingsSchema>) {
  if (!can(actor, "tradeSettings.manage")) throw forbidden();
  const org = await tradeOrg(actor);
  if (org.kind !== "COOPERATIVE") throw forbidden();
  const data = coopSettingsSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.cooperative.findUnique({ where: { orgId: org.id } });
    const saved = await tx.cooperative.upsert({
      where: { orgId: org.id },
      update: {
        ...data,
        duesPct: data.duesPct,
        duesFlatLe: data.duesFlatLe,
        approvalThresholdLe: data.approvalThresholdLe,
      },
      create: { orgId: org.id, ...data },
    });
    await audit(tx, {
      actor,
      action: "coop.settings_updated",
      entity: "Cooperative",
      entityId: org.id,
      before,
      after: data,
    });
    return saved;
  });
}

export async function updateBuyerSettings(
  actor: Actor,
  input: z.input<typeof buyerSettingsSchema>,
) {
  if (!can(actor, "tradeSettings.manage")) throw forbidden();
  const org = await tradeOrg(actor);
  if (org.kind !== "BUYER") throw forbidden();
  const data = buyerSettingsSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.buyer.findUnique({ where: { orgId: org.id } });
    const saved = await tx.buyer.upsert({
      where: { orgId: org.id },
      update: data,
      create: { orgId: org.id, ...data },
    });
    await audit(tx, {
      actor,
      action: "buyer.settings_updated",
      entity: "Buyer",
      entityId: org.id,
      before,
      after: data,
    });
    return saved;
  });
}

// ---------- Collection points ----------

export async function listCollectionPoints(actor: Actor, includeInactive = false) {
  const org = await tradeOrg(actor);
  return prisma.collectionPoint.findMany({
    where: { ownerOrgId: org.id, ...(includeInactive ? {} : { active: true }) },
    orderBy: { name: "asc" },
  });
}

export async function createCollectionPoint(
  actor: Actor,
  input: z.input<typeof collectionPointSchema>,
) {
  if (!can(actor, "tradeSettings.manage")) throw forbidden();
  const org = await tradeOrg(actor);
  const data = collectionPointSchema.parse(input);
  const exists = await prisma.collectionPoint.findUnique({
    where: { ownerOrgId_name: { ownerOrgId: org.id, name: data.name } },
  });
  if (exists) throw new AppError("CONFLICT", "A collection point with this name already exists.");
  return prisma.$transaction(async (tx) => {
    const cp = await tx.collectionPoint.create({
      data: { ...data, districtId: data.districtId ?? null, ownerOrgId: org.id },
    });
    await audit(tx, {
      actor,
      action: "collection_point.created",
      entity: "CollectionPoint",
      entityId: cp.id,
      after: data,
    });
    return cp;
  });
}

export async function setCollectionPointActive(actor: Actor, id: string, active: boolean) {
  if (!can(actor, "tradeSettings.manage")) throw forbidden();
  const org = await tradeOrg(actor);
  const cp = await prisma.collectionPoint.findUnique({ where: { id } });
  if (!cp || cp.ownerOrgId !== org.id) throw notFound("Collection point");
  await prisma.$transaction(async (tx) => {
    await tx.collectionPoint.update({ where: { id }, data: { active } });
    await audit(tx, {
      actor,
      action: active ? "collection_point.activated" : "collection_point.deactivated",
      entity: "CollectionPoint",
      entityId: id,
    });
  });
}

// ---------- Price lists ----------

/** Active price for a crop/grade at a time. Grade-specific prices win over "any grade". */
export async function getActivePrice(
  db: Db,
  orgId: string,
  cropId: string,
  grade: string | null,
  at = new Date(),
) {
  const active = await db.priceList.findMany({
    where: {
      ownerOrgId: orgId,
      cropId,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    orderBy: { validFrom: "desc" },
  });
  return (
    (grade ? active.find((p) => p.grade === grade) : undefined) ??
    active.find((p) => p.grade === null) ??
    null
  );
}

export async function listActivePrices(actor: Actor) {
  const org = await tradeOrg(actor);
  const now = new Date();
  return prisma.priceList.findMany({
    where: {
      ownerOrgId: org.id,
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    orderBy: [{ crop: { name: "asc" } }, { grade: "asc" }],
    include: { crop: true },
  });
}

export async function priceHistory(actor: Actor, cropId: string) {
  const org = await tradeOrg(actor);
  return prisma.priceList.findMany({
    where: { ownerOrgId: org.id, cropId },
    orderBy: { validFrom: "desc" },
    take: 20,
  });
}

/** Set a new price (closes the current one for the same crop + grade). */
export async function setPrice(actor: Actor, input: z.input<typeof setPriceSchema>) {
  if (!can(actor, "price.manage")) throw forbidden();
  const org = await tradeOrg(actor);
  const data = setPriceSchema.parse(input);
  const crop = await prisma.crop.findUnique({ where: { id: data.cropId } });
  if (!crop) throw new AppError("VALIDATION", "Unknown crop.");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const current = await tx.priceList.findMany({
      where: {
        ownerOrgId: org.id,
        cropId: data.cropId,
        grade: data.grade,
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
    });
    if (current.length)
      await tx.priceList.updateMany({
        where: { id: { in: current.map((c) => c.id) } },
        data: { validTo: now },
      });
    const price = await tx.priceList.create({
      data: {
        ownerOrgId: org.id,
        cropId: data.cropId,
        grade: data.grade,
        unit: data.unit,
        priceLe: new Prisma.Decimal(data.priceLe),
        validFrom: now,
        createdById: actor.userId,
      },
    });
    await audit(tx, {
      actor,
      action: "price.set",
      entity: "PriceList",
      entityId: price.id,
      before: current[0] ? { priceLe: current[0].priceLe, grade: current[0].grade } : null,
      after: { crop: crop.code, grade: data.grade, priceLe: data.priceLe, unit: data.unit },
    });
    return price;
  });
}
