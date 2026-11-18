import "server-only";
import { Prisma, prisma } from "@agripay/db";
import { type Actor, can } from "@agripay/validation/permissions";
import { forbidden } from "../errors";

/** Trade KPIs for a co-op or buyer dashboard. */
export async function tradeStats(actor: Actor) {
  if (!can(actor, "purchase.read") || !actor.orgId) throw forbidden();
  const orgId = actor.orgId;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [purchases30, paid, waiting, disputes, farmersPaid, failed] = await Promise.all([
    prisma.purchase.aggregate({
      where: { buyerOrgId: orgId, status: { not: "CANCELLED" }, recordedAt: { gte: since } },
      _count: true,
      _sum: { netLe: true },
    }),
    prisma.paymentSplit.aggregate({
      where: { type: "FARMER_WALLET", status: "SUCCESS", payment: { payerOrgId: orgId } },
      _sum: { amountLe: true },
    }),
    prisma.purchase.count({ where: { buyerOrgId: orgId, status: "RECORDED" } }),
    prisma.purchase.count({
      where: { buyerOrgId: orgId, disputedAt: { not: null }, disputeResolvedAt: null },
    }),
    prisma.purchase.findMany({
      where: { buyerOrgId: orgId, status: "PAID" },
      distinct: ["farmerId"],
      select: { farmerId: true },
    }),
    prisma.payment.count({ where: { payerOrgId: orgId, status: { in: ["FAILED", "PARTIAL"] } } }),
  ]);
  return {
    purchases30: purchases30._count,
    value30Le: (purchases30._sum.netLe ?? new Prisma.Decimal(0)).toFixed(2),
    paidToFarmersLe: (paid._sum.amountLe ?? new Prisma.Decimal(0)).toFixed(2),
    waitingApproval: waiting,
    openDisputes: disputes,
    farmersPaid: farmersPaid.length,
    failedPayments: failed,
  };
}
