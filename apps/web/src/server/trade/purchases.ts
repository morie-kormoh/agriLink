import "server-only";
import { Prisma, nextSequenceValue, prisma } from "@agrilink/db";
import {
  type RecordPurchaseData,
  formatLe,
  listPurchasesSchema,
  maskPhone,
  normalizeSlPhone,
  recordPurchaseSchema,
} from "@agrilink/validation";
import { type Actor, can } from "@agrilink/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { emit } from "../events";
import { sendSms } from "../sms";
import { getActivePrice, tradeOrg } from "./settings";

export const ACK_WINDOW_MS = 48 * 3600 * 1000;
/** Sanity limit on a single purchase (kg). */
const MAX_KG = 50_000;

// ---------------------------------------------------------------------------
// Pure money calculation (server-side only — never trusted from the client)
// ---------------------------------------------------------------------------

export function computePurchaseAmounts(
  quantity: number | string,
  unitPriceLe: string,
  deductions: { amountLe: string }[],
) {
  const gross = new Prisma.Decimal(quantity)
    .mul(unitPriceLe)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const deducted = deductions
    .reduce((s, d) => s.plus(d.amountLe), new Prisma.Decimal(0))
    .toDecimalPlaces(2);
  const net = gross.minus(deducted);
  return { grossLe: gross, deductionsLe: deducted, netLe: net };
}

// ---------------------------------------------------------------------------
// Farmer lookup at the weigh point
// ---------------------------------------------------------------------------

/**
 * Co-ops search their own members (name, phone, AgriLink ID).
 * Buyers can only find a farmer by an exact AgriLink ID or phone number — they never browse the registry.
 */
export async function findFarmersForPurchase(actor: Actor, q: string) {
  if (!can(actor, "purchase.create")) throw forbidden();
  const org = await tradeOrg(actor);
  const query = q.trim();
  if (query.length < 2) return [];
  const phone = normalizeSlPhone(query);
  const id = query.toUpperCase();

  const where: Prisma.FarmerWhereInput =
    org.kind === "COOPERATIVE"
      ? {
          cooperativeId: org.id,
          status: { not: "INACTIVE" },
          OR: [
            { agrilinkId: { contains: id } },
            { fullName: { contains: query, mode: "insensitive" } },
            ...(phone ? [{ phone }] : []),
          ],
        }
      : { status: { not: "INACTIVE" }, OR: [{ agrilinkId: id }, ...(phone ? [{ phone }] : [])] };

  const farmers = await prisma.farmer.findMany({
    where,
    take: 10,
    orderBy: { fullName: "asc" },
    include: { wallets: { where: { isPrimary: true }, take: 1 }, chiefdom: true },
  });
  return farmers.map((f) => ({
    id: f.id,
    agrilinkId: f.agrilinkId,
    fullName: f.fullName,
    community: `${f.community}, ${f.chiefdom.name}`,
    phone: org.kind === "BUYER" ? maskPhone(f.phone) : f.phone,
    hasWallet: f.wallets.length > 0,
    status: f.status,
  }));
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

async function openBatchFor(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
  collectionPointId: string | null,
) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const existing = await tx.purchaseBatch.findFirst({
    where: {
      ownerOrgId: orgId,
      createdById: userId,
      collectionPointId,
      status: "OPEN",
      createdAt: { gte: startOfDay },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  const n = await nextSequenceValue(tx, "batch");
  return tx.purchaseBatch.create({
    data: {
      ref: `BAT-${String(n).padStart(6, "0")}`,
      ownerOrgId: orgId,
      createdById: userId,
      collectionPointId,
    },
  });
}

export interface RecordedPurchase {
  created: boolean;
  purchase: {
    id: string;
    ref: string;
    status: string;
    grossLe: string;
    netLe: string;
    batchId: string;
  };
  warnings: string[];
}

/**
 * Record a weighed purchase (module 03). Idempotent on clientRef (mobile/offline retries).
 * Amounts are always computed here; a price different from the active price list needs a reason.
 */
export async function recordPurchase(
  actor: Actor,
  input: z.input<typeof recordPurchaseSchema>,
): Promise<RecordedPurchase> {
  if (!can(actor, "purchase.create")) throw forbidden();
  const data: RecordPurchaseData = recordPurchaseSchema.parse(input);
  const org = await tradeOrg(actor);

  if (data.clientRef) {
    const existing = await prisma.purchase.findUnique({ where: { clientRef: data.clientRef } });
    if (existing) {
      if (existing.buyerOrgId !== org.id) throw forbidden();
      return { created: false, purchase: shape(existing), warnings: [] };
    }
  }

  const farmer = await prisma.farmer.findUnique({
    where: { id: data.farmerId },
    include: { wallets: { where: { isPrimary: true }, take: 1 } },
  });
  if (!farmer || farmer.status === "INACTIVE")
    throw new AppError("VALIDATION", "Farmer not found or inactive.");
  if (org.kind === "COOPERATIVE" && farmer.cooperativeId !== org.id)
    throw forbidden("This farmer is not a member of your cooperative.");
  const crop = await prisma.crop.findUnique({ where: { id: data.cropId } });
  if (!crop || !crop.active) throw new AppError("VALIDATION", "Unknown crop.");

  const kg =
    data.unit === "kg" ? data.quantity : data.unit === "tonne" ? data.quantity * 1000 : null;
  if (kg !== null && kg > MAX_KG)
    throw new AppError(
      "VALIDATION",
      `Quantity looks too large (max ${MAX_KG.toLocaleString("en")} kg per purchase).`,
    );

  if (data.collectionPointId) {
    const cp = await prisma.collectionPoint.findUnique({ where: { id: data.collectionPointId } });
    if (!cp || cp.ownerOrgId !== org.id || !cp.active)
      throw new AppError("VALIDATION", "Unknown collection point.");
  }

  const listPrice = await getActivePrice(prisma, org.id, crop.id, data.grade);
  let unitPrice: string;
  let overrideReason: string | null = null;
  if (data.unitPriceLe == null) {
    if (!listPrice)
      throw new AppError(
        "VALIDATION",
        `No price set for ${crop.name}${data.grade ? ` grade ${data.grade}` : ""}. Enter a price or set one in Prices.`,
      );
    if (listPrice.unit !== data.unit)
      throw new AppError(
        "VALIDATION",
        `The ${crop.name} price is per ${listPrice.unit}. Record the quantity in ${listPrice.unit} or enter a price.`,
      );
    unitPrice = listPrice.priceLe.toFixed(2);
  } else {
    unitPrice = data.unitPriceLe;
    const differs =
      !listPrice || !listPrice.priceLe.equals(unitPrice) || listPrice.unit !== data.unit;
    if (listPrice && differs) {
      if (!data.priceOverrideReason)
        throw new AppError(
          "VALIDATION",
          "Give a reason for changing the listed price.",
          undefined,
          { field: "priceOverrideReason" },
        );
      overrideReason = data.priceOverrideReason;
    } else if (!listPrice) {
      overrideReason = data.priceOverrideReason ?? "No price list";
    }
  }

  const amounts = computePurchaseAmounts(data.quantity, unitPrice, data.deductions);
  if (amounts.netLe.lte(0))
    throw new AppError("VALIDATION", "Deductions cannot be more than the purchase value.");

  const warnings: string[] = [];
  if (!farmer.wallets.length) warnings.push("NO_WALLET");
  if (farmer.status === "DUPLICATE_SUSPECTED") warnings.push("FARMER_DUPLICATE_SUSPECTED");
  if (overrideReason && listPrice) warnings.push("PRICE_OVERRIDDEN");

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const batch = await openBatchFor(tx, org.id, actor.userId, data.collectionPointId);
      const cycle = await tx.cropCycle.findFirst({
        where: { cropId: crop.id, plot: { farmerId: farmer.id } },
        orderBy: { createdAt: "desc" },
      });
      const n = await nextSequenceValue(tx, "purchase");
      const p = await tx.purchase.create({
        data: {
          ref: `PUR-${String(n).padStart(6, "0")}`,
          clientRef: data.clientRef ?? null,
          farmerId: farmer.id,
          buyerOrgId: org.id,
          cooperativeId: farmer.cooperativeId,
          batchId: batch.id,
          cropId: crop.id,
          cropCycleId: cycle?.id ?? null,
          grade: data.grade,
          quantity: new Prisma.Decimal(data.quantity),
          unit: data.unit,
          bags: data.bags ?? null,
          unitPriceLe: new Prisma.Decimal(unitPrice),
          listPriceLe: listPrice?.priceLe ?? null,
          priceOverrideReason: overrideReason,
          grossLe: amounts.grossLe,
          deductions: data.deductions as unknown as Prisma.InputJsonValue,
          deductionsLe: amounts.deductionsLe,
          netLe: amounts.netLe,
          recordedById: actor.userId,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          ackDeadline: new Date(Date.now() + ACK_WINDOW_MS),
        },
      });
      await audit(tx, {
        actor,
        action: "purchase.recorded",
        entity: "Purchase",
        entityId: p.id,
        after: {
          ref: p.ref,
          farmer: farmer.agrilinkId,
          crop: crop.code,
          quantity: data.quantity,
          unit: data.unit,
          unitPriceLe: unitPrice,
          listPriceLe: listPrice?.priceLe ?? null,
          overrideReason,
          netLe: amounts.netLe,
        },
      });
      return p;
    });

    const deductionText = amounts.deductionsLe.gt(0)
      ? `Deductions ${formatLe(amounts.deductionsLe.toString())}. `
      : "";
    await sendSms(
      farmer.phone,
      `AgriLink: ${org.name} bought ${data.quantity}${data.unit}${data.bags ? ` (${data.bags} bags)` : ""} ${crop.name}${data.grade ? ` grade ${data.grade}` : ""} @ ${formatLe(unitPrice)} = ${formatLe(amounts.grossLe.toString())}. ${deductionText}Net ${formatLe(amounts.netLe.toString())}. Reply 1 to confirm, 2 to report a problem. Ref ${purchase.ref}`,
      "general",
    );
    await emit("purchase.recorded", { purchaseId: purchase.id });
    return { created: true, purchase: shape(purchase), warnings };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && data.clientRef) {
      const existing = await prisma.purchase.findUnique({ where: { clientRef: data.clientRef } });
      if (existing) return { created: false, purchase: shape(existing), warnings: [] };
    }
    throw e;
  }
}

function shape(p: {
  id: string;
  ref: string;
  status: string;
  grossLe: Prisma.Decimal;
  netLe: Prisma.Decimal;
  batchId: string;
}) {
  return {
    id: p.id,
    ref: p.ref,
    status: p.status,
    grossLe: p.grossLe.toFixed(2),
    netLe: p.netLe.toFixed(2),
    batchId: p.batchId,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function purchaseScope(actor: Actor): Prisma.PurchaseWhereInput {
  if (!can(actor, "purchase.read")) throw forbidden();
  if (actor.role === "SUPER_ADMIN") return {};
  if (actor.role === "FARMER") return { farmerId: actor.farmerId ?? "__none__" };
  if (!actor.orgId) throw forbidden();
  return { buyerOrgId: actor.orgId };
}

export async function listPurchases(actor: Actor, input: z.input<typeof listPurchasesSchema> = {}) {
  const f = listPurchasesSchema.parse(input);
  const and: Prisma.PurchaseWhereInput[] = [purchaseScope(actor)];
  if (f.status) and.push({ status: f.status });
  if (f.batchId) and.push({ batchId: f.batchId });
  if (f.farmerId) and.push({ farmerId: f.farmerId });
  if (f.q)
    and.push({
      OR: [
        { ref: { contains: f.q.toUpperCase() } },
        { farmer: { fullName: { contains: f.q, mode: "insensitive" } } },
        { farmer: { agrilinkId: { contains: f.q.toUpperCase() } } },
      ],
    });
  const where: Prisma.PurchaseWhereInput = { AND: and };
  const [total, items] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      orderBy: { recordedAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: {
        farmer: { select: { id: true, fullName: true, agrilinkId: true } },
        crop: { select: { name: true } },
        batch: { select: { ref: true } },
        buyerOrg: { select: { name: true } },
        payment: { select: { ref: true, status: true } },
      },
    }),
  ]);
  return { total, items, page: f.page, pages: Math.max(1, Math.ceil(total / f.pageSize)) };
}

export async function getPurchase(actor: Actor, id: string) {
  const p = await prisma.purchase.findFirst({
    where: { AND: [{ id }, purchaseScope(actor)] },
    include: {
      farmer: { include: { wallets: { where: { isPrimary: true } } } },
      crop: true,
      batch: true,
      buyerOrg: true,
      payment: {
        include: { splits: { orderBy: { order: "asc" }, include: { instructions: true } } },
      },
    },
  });
  if (!p) throw notFound("Purchase");
  return p;
}

// ---------------------------------------------------------------------------
// Cancellation, farmer acknowledgement, disputes
// ---------------------------------------------------------------------------

export async function cancelPurchase(actor: Actor, id: string, reason: string) {
  const p = await prisma.purchase.findUnique({ where: { id } });
  if (!p) throw notFound("Purchase");
  if (actor.role !== "SUPER_ADMIN" && p.buyerOrgId !== actor.orgId) throw forbidden();
  const isRecorder = p.recordedById === actor.userId;
  if (!can(actor, "payment.approve") && !(isRecorder && can(actor, "purchase.create")))
    throw forbidden();
  if (p.status !== "RECORDED" && p.status !== "DISPUTED")
    throw new AppError("CONFLICT", "Only purchases that have not been paid can be cancelled.");
  await prisma.$transaction(async (tx) => {
    const updated = await tx.purchase.updateMany({
      where: { id, status: { in: ["RECORDED", "DISPUTED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    if (updated.count !== 1)
      throw new AppError("CONFLICT", "Purchase changed — refresh and try again.");
    await audit(tx, {
      actor,
      action: "purchase.cancelled",
      entity: "Purchase",
      entityId: id,
      before: { status: p.status },
      after: { reason },
    });
  });
  const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: p.farmerId } });
  await sendSms(
    farmer.phone,
    `AgriLink: purchase ${p.ref} (${formatLe(p.netLe.toString())}) was cancelled. Reason: ${reason}`,
    "general",
  );
  await emit("purchase.cancelled", { purchaseId: id });
}

/**
 * Farmer replies to the purchase SMS: "1" confirms, "2" disputes (freezes payment until resolved).
 * Identified by the farmer (app) or by phone (SMS reply). Applies to the given ref or the most recent purchase.
 */
export async function acknowledgePurchase(
  who: { farmerId: string } | { phone: string },
  reply: "1" | "2",
  opts: { reason?: string | null; purchaseRef?: string | null } = {},
) {
  const farmerWhere: Prisma.FarmerWhereInput =
    "farmerId" in who ? { id: who.farmerId } : { phone: who.phone, status: { not: "INACTIVE" } };
  const purchase = await prisma.purchase.findFirst({
    where: {
      farmer: farmerWhere,
      ...(opts.purchaseRef
        ? { ref: opts.purchaseRef.toUpperCase() }
        : { farmerAcknowledgedAt: null, disputedAt: null }),
      status: { notIn: ["CANCELLED"] },
    },
    orderBy: { recordedAt: "desc" },
    include: { farmer: true },
  });
  if (!purchase) throw new AppError("NOT_FOUND", "No recent purchase to confirm.");
  if (purchase.ackDeadline < new Date() && !opts.purchaseRef)
    throw new AppError(
      "CONFLICT",
      "The 48-hour window for this purchase has passed. Contact your cooperative.",
    );

  if (reply === "1") {
    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { farmerAcknowledgedAt: new Date() },
      });
      await audit(tx, {
        actor: { userId: purchase.farmer.userId ?? purchase.farmerId, role: "FARMER", orgId: null },
        action: "purchase.acknowledged",
        entity: "Purchase",
        entityId: purchase.id,
      });
    });
    return { ref: purchase.ref, result: "CONFIRMED" as const };
  }

  const freeze = purchase.status === "RECORDED";
  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        disputedAt: new Date(),
        disputeReason: opts.reason ?? "Reported by farmer",
        ...(freeze ? { status: "DISPUTED" } : {}),
      },
    });
    await audit(tx, {
      actor: { userId: purchase.farmer.userId ?? purchase.farmerId, role: "FARMER", orgId: null },
      action: "purchase.disputed",
      entity: "Purchase",
      entityId: purchase.id,
      after: { reason: opts.reason ?? null, frozen: freeze },
    });
  });
  await sendSms(
    purchase.farmer.phone,
    `AgriLink: we received your report on ${purchase.ref}. Payment is on hold until your cooperative reviews it.`,
    "general",
  );
  return { ref: purchase.ref, result: "DISPUTED" as const, frozen: freeze };
}

export async function listDisputes(actor: Actor) {
  if (!can(actor, "dispute.resolve")) throw forbidden();
  return prisma.purchase.findMany({
    where: { AND: [purchaseScope(actor), { disputedAt: { not: null }, disputeResolvedAt: null }] },
    orderBy: { disputedAt: "desc" },
    include: {
      farmer: { select: { fullName: true, agrilinkId: true, phone: true } },
      crop: { select: { name: true } },
    },
  });
}

/** UPHOLD = the farmer is right → cancel the purchase. REJECT = proceed → back to RECORDED for approval. */
export async function resolveDispute(
  actor: Actor,
  id: string,
  outcome: "UPHOLD" | "REJECT",
  note: string,
) {
  if (!can(actor, "dispute.resolve")) throw forbidden();
  const p = await prisma.purchase.findUnique({ where: { id }, include: { farmer: true } });
  if (!p || (actor.role !== "SUPER_ADMIN" && p.buyerOrgId !== actor.orgId))
    throw notFound("Purchase");
  if (!p.disputedAt || p.disputeResolvedAt)
    throw new AppError("CONFLICT", "This purchase has no open dispute.");
  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id },
      data: {
        disputeResolvedAt: new Date(),
        disputeResolution: `${outcome}: ${note}`,
        ...(p.status === "DISPUTED"
          ? outcome === "UPHOLD"
            ? {
                status: "CANCELLED",
                cancelledAt: new Date(),
                cancelReason: `Dispute upheld: ${note}`,
              }
            : { status: "RECORDED" }
          : {}),
      },
    });
    await audit(tx, {
      actor,
      action: "purchase.dispute_resolved",
      entity: "Purchase",
      entityId: id,
      after: { outcome, note },
    });
  });
  await sendSms(
    p.farmer.phone,
    outcome === "UPHOLD"
      ? `AgriLink: your report on ${p.ref} was accepted. The purchase was cancelled. ${note}`
      : `AgriLink: your report on ${p.ref} was reviewed: ${note}. Payment will continue.`,
    "general",
  );
  if (outcome === "UPHOLD" && p.status === "DISPUTED")
    await emit("purchase.cancelled", { purchaseId: id });
}
