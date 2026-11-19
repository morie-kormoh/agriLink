import "server-only";
import { type Prisma, prisma } from "@agrilink/db";
import { type Actor, can } from "@agrilink/validation/permissions";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { createPaymentForPurchase, dispatchPayments } from "../payments/service";
import { tradeOrg } from "./settings";

function batchScope(actor: Actor): Prisma.PurchaseBatchWhereInput {
  if (!can(actor, "purchase.read")) throw forbidden();
  if (actor.role === "SUPER_ADMIN") return {};
  if (!actor.orgId) throw forbidden();
  return { ownerOrgId: actor.orgId };
}

export async function listBatches(
  actor: Actor,
  opts: { status?: "OPEN" | "SUBMITTED" | "APPROVED"; take?: number } = {},
) {
  const batches = await prisma.purchaseBatch.findMany({
    where: { AND: [batchScope(actor), opts.status ? { status: opts.status } : {}] },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 50,
    include: {
      collectionPoint: { select: { name: true } },
      purchases: { select: { netLe: true, status: true } },
    },
  });
  const creators = await prisma.user.findMany({
    where: { id: { in: [...new Set(batches.map((b) => b.createdById))] } },
    select: { id: true, name: true },
  });
  const names = new Map(creators.map((c) => [c.id, c.name]));
  return batches.map((b) => {
    const live = b.purchases.filter((p) => p.status !== "CANCELLED");
    return {
      ...b,
      createdByName: names.get(b.createdById) ?? null,
      count: live.length,
      totalNetLe: live.reduce((s, p) => s + Number(p.netLe), 0).toFixed(2),
      byStatus: live.reduce<Record<string, number>>(
        (acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }),
        {},
      ),
    };
  });
}

export async function getBatch(actor: Actor, id: string) {
  const batch = await prisma.purchaseBatch.findFirst({
    where: { AND: [{ id }, batchScope(actor)] },
    include: {
      collectionPoint: true,
      purchases: {
        orderBy: { recordedAt: "asc" },
        include: {
          farmer: {
            select: {
              id: true,
              fullName: true,
              agrilinkId: true,
              wallets: { where: { isPrimary: true }, select: { id: true } },
            },
          },
          crop: { select: { name: true } },
          payment: { include: { splits: { orderBy: { order: "asc" } } } },
        },
      },
    },
  });
  if (!batch) throw notFound("Batch");
  const people = await prisma.user.findMany({
    where: {
      id: {
        in: [batch.createdById, batch.submittedById, batch.approvedById].filter(
          (x): x is string => !!x,
        ),
      },
    },
    select: { id: true, name: true },
  });
  const names = new Map(people.map((p) => [p.id, p.name]));
  return { ...batch, names: Object.fromEntries(names) as Record<string, string | null> };
}

export async function submitBatch(actor: Actor, id: string) {
  if (!can(actor, "purchase.create")) throw forbidden();
  const org = await tradeOrg(actor);
  const batch = await prisma.purchaseBatch.findUnique({
    where: { id },
    include: { purchases: { where: { status: { not: "CANCELLED" } } } },
  });
  if (!batch || batch.ownerOrgId !== org.id) throw notFound("Batch");
  if (batch.status !== "OPEN")
    throw new AppError("CONFLICT", "This batch has already been submitted.");
  if (batch.purchases.length === 0) throw new AppError("VALIDATION", "The batch has no purchases.");
  await prisma.$transaction(async (tx) => {
    await tx.purchaseBatch.update({
      where: { id },
      data: { status: "SUBMITTED", submittedById: actor.userId, submittedAt: new Date() },
    });
    await audit(tx, {
      actor,
      action: "batch.submitted",
      entity: "PurchaseBatch",
      entityId: id,
      after: { purchases: batch.purchases.length },
    });
  });
}

export type HoldReason = "MAKER_CHECKER" | "OVER_THRESHOLD" | "NO_WALLET" | "DISPUTED";

async function thresholdFor(orgId: string) {
  const [coop, buyer] = await Promise.all([
    prisma.cooperative.findUnique({ where: { orgId } }),
    prisma.buyer.findUnique({ where: { orgId } }),
  ]);
  return (coop ?? buyer)?.approvalThresholdLe ?? null;
}

/**
 * Approve & pay a submitted batch (maker–checker: the approver can't be who created/submitted the batch
 * or recorded the purchase). Purchases over the threshold, without a wallet, or disputed are held back.
 */
export async function approveBatch(actor: Actor, id: string) {
  if (!can(actor, "payment.approve")) throw forbidden();
  const org = await tradeOrg(actor);
  const batch = await prisma.purchaseBatch.findUnique({
    where: { id },
    include: {
      purchases: {
        include: { farmer: { include: { wallets: { where: { isPrimary: true }, take: 1 } } } },
      },
    },
  });
  if (!batch || batch.ownerOrgId !== org.id) throw notFound("Batch");
  if (batch.status !== "SUBMITTED")
    throw new AppError(
      "CONFLICT",
      batch.status === "OPEN"
        ? "Submit the batch before approving it."
        : "This batch is already approved.",
    );
  if (batch.createdById === actor.userId || batch.submittedById === actor.userId) {
    throw new AppError("FORBIDDEN", "A different person must approve this batch (maker–checker).");
  }

  const threshold = await thresholdFor(org.id);
  const held: { purchaseId: string; ref: string; reason: HoldReason }[] = [];
  const toApprove: string[] = [];
  for (const p of batch.purchases) {
    if (p.status === "DISPUTED") held.push({ purchaseId: p.id, ref: p.ref, reason: "DISPUTED" });
    else if (p.status !== "RECORDED") continue;
    else if (p.recordedById === actor.userId)
      held.push({ purchaseId: p.id, ref: p.ref, reason: "MAKER_CHECKER" });
    else if (!p.farmer.wallets.length)
      held.push({ purchaseId: p.id, ref: p.ref, reason: "NO_WALLET" });
    else if (threshold && p.netLe.gt(threshold))
      held.push({ purchaseId: p.id, ref: p.ref, reason: "OVER_THRESHOLD" });
    else toApprove.push(p.id);
  }

  const paymentIds = await prisma.$transaction(
    async (tx) => {
      const ids: string[] = [];
      for (const pid of toApprove) {
        const updated = await tx.purchase.updateMany({
          where: { id: pid, status: "RECORDED" },
          data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() },
        });
        if (updated.count !== 1) continue;
        const payment = await createPaymentForPurchase(tx, pid, actor.userId);
        ids.push(payment.id);
      }
      const remaining = await tx.purchase.count({
        where: { batchId: id, status: { in: ["RECORDED", "DISPUTED"] } },
      });
      if (remaining === 0) {
        await tx.purchaseBatch.update({
          where: { id },
          data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() },
        });
      }
      await audit(tx, {
        actor,
        action: "batch.approved",
        entity: "PurchaseBatch",
        entityId: id,
        after: {
          approved: ids.length,
          held: held.map((h) => ({ ref: h.ref, reason: h.reason })),
          fullyApproved: remaining === 0,
        },
      });
      return ids;
    },
    { timeout: 60_000 },
  );

  await dispatchPayments(paymentIds);
  return { approved: paymentIds.length, paymentIds, held };
}

/** Approve one purchase on its own (used for purchases held over the threshold). */
export async function approvePurchase(actor: Actor, purchaseId: string) {
  if (!can(actor, "payment.approve")) throw forbidden();
  const org = await tradeOrg(actor);
  const p = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { batch: true },
  });
  if (!p || p.buyerOrgId !== org.id) throw notFound("Purchase");
  if (p.status !== "RECORDED")
    throw new AppError(
      "CONFLICT",
      p.status === "DISPUTED"
        ? "Resolve the dispute first."
        : "This purchase is not waiting for approval.",
    );
  if (p.recordedById === actor.userId || p.batch.createdById === actor.userId) {
    throw new AppError(
      "FORBIDDEN",
      "A different person must approve this purchase (maker–checker).",
    );
  }
  const payment = await prisma.$transaction(async (tx) => {
    const updated = await tx.purchase.updateMany({
      where: { id: purchaseId, status: "RECORDED" },
      data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() },
    });
    if (updated.count !== 1)
      throw new AppError("CONFLICT", "Purchase changed — refresh and try again.");
    const pay = await createPaymentForPurchase(tx, purchaseId, actor.userId);
    await audit(tx, {
      actor,
      action: "purchase.approved",
      entity: "Purchase",
      entityId: purchaseId,
      after: { payment: pay.ref },
    });
    const remaining = await tx.purchase.count({
      where: { batchId: p.batchId, status: { in: ["RECORDED", "DISPUTED"] } },
    });
    if (remaining === 0 && p.batch.status === "SUBMITTED") {
      await tx.purchaseBatch.update({
        where: { id: p.batchId },
        data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() },
      });
    }
    return pay;
  });
  await dispatchPayments([payment.id]);
  return payment;
}

/** Suppliers report for buyers (traceability): farmers, volumes and value by crop. */
export async function supplierReport(actor: Actor) {
  if (!can(actor, "purchase.read") || !actor.orgId) throw forbidden();
  const rows = await prisma.$queryRaw<
    {
      farmerId: string;
      agrilinkId: string;
      fullName: string;
      district: string;
      chiefdom: string;
      community: string;
      crop: string;
      purchases: bigint;
      quantity: string;
      unit: string;
      netLe: string;
      lastPurchase: Date;
    }[]
  >`
    SELECT f.id AS "farmerId", f."agripayId" AS "agrilinkId", f."fullName", d.name AS district, c.name AS chiefdom, f.community,
           cr.name AS crop, COUNT(*) AS purchases, SUM(p.quantity)::text AS quantity, p.unit,
           SUM(p."netLe")::text AS "netLe", MAX(p."recordedAt") AS "lastPurchase"
    FROM "Purchase" p
    JOIN "Farmer" f ON f.id = p."farmerId"
    JOIN "District" d ON d.id = f."districtId"
    JOIN "Chiefdom" c ON c.id = f."chiefdomId"
    JOIN "Crop" cr ON cr.id = p."cropId"
    WHERE p."buyerOrgId" = ${actor.orgId} AND p.status <> 'CANCELLED'
    GROUP BY f.id, d.name, c.name, cr.name, p.unit
    ORDER BY SUM(p."netLe") DESC
  `;
  return rows.map((r) => ({ ...r, purchases: Number(r.purchases) }));
}
