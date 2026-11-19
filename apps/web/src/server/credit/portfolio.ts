import "server-only";
import { Prisma, prisma } from "@agrilink/db";
import { daysPastDue } from "@agrilink/finance";
import { type Actor, can } from "@agrilink/validation/permissions";
import { forbidden } from "../errors";
import { lenderOrgId } from "../finance/common";

const BOOKED = [
  "DISBURSED",
  "REPAYING",
  "REPAID",
  "LATE",
  "DEFAULTED",
  "RESTRUCTURED",
  "WRITTEN_OFF",
] as const;

interface Bucket {
  loans: number;
  disbursedLe: Prisma.Decimal;
  outstandingLe: Prisma.Decimal;
  par30Le: Prisma.Decimal;
  par90Le: Prisma.Decimal;
  dueLe: Prisma.Decimal;
  repaidOfDueLe: Prisma.Decimal;
}
const empty = (): Bucket => ({
  loans: 0,
  disbursedLe: new Prisma.Decimal(0),
  outstandingLe: new Prisma.Decimal(0),
  par30Le: new Prisma.Decimal(0),
  par90Le: new Prisma.Decimal(0),
  dueLe: new Prisma.Decimal(0),
  repaidOfDueLe: new Prisma.Decimal(0),
});

function finish(b: Bucket) {
  const pct = (a: Prisma.Decimal, d: Prisma.Decimal) =>
    d.gt(0) ? Number(a.div(d).mul(100).toFixed(1)) : null;
  return {
    loans: b.loans,
    disbursedLe: b.disbursedLe.toFixed(2),
    outstandingLe: b.outstandingLe.toFixed(2),
    par30Pct: pct(b.par30Le, b.outstandingLe),
    par90Pct: pct(b.par90Le, b.outstandingLe),
    /** Of what has fallen due, how much was repaid. */
    repaymentRatePct: pct(b.repaidOfDueLe, b.dueLe),
  };
}

/**
 * Portfolio metrics computed straight from loan records (so they always match):
 * disbursed, outstanding, PAR30 / PAR90 (share of outstanding more than 30 / 90 days past due) and
 * repayment rate on matured loans; disaggregated by district, crop and gender for inclusion reporting.
 */
export async function getPortfolio(
  actor: Actor,
  filters: { productId?: string; districtId?: string } = {},
  now = new Date(),
) {
  if (!can(actor, "loan.read")) throw forbidden();
  const orgId = lenderOrgId(actor);
  const loans = await prisma.loan.findMany({
    where: {
      lenderOrgId: orgId,
      status: { in: [...BOOKED] },
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.districtId ? { farmer: { districtId: filters.districtId } } : {}),
    },
    include: {
      farmer: { select: { gender: true, district: { select: { name: true } } } },
      product: { select: { name: true, cropIds: true } },
      voucher: { select: { valueLe: true, remainingLe: true } },
    },
  });
  const crops = await prisma.crop.findMany({ select: { id: true, name: true } });
  const total = empty();
  const by = {
    district: new Map<string, Bucket>(),
    gender: new Map<string, Bucket>(),
    crop: new Map<string, Bucket>(),
    product: new Map<string, Bucket>(),
  };
  for (const l of loans) {
    const disbursed = l.voucher
      ? l.voucher.valueLe.minus(l.voucher.remainingLe)
      : (l.approvedLe ?? new Prisma.Decimal(0));
    const outstanding =
      l.status === "WRITTEN_OFF"
        ? new Prisma.Decimal(0)
        : Prisma.Decimal.max((l.totalDueLe ?? new Prisma.Decimal(0)).minus(l.repaidLe), 0);
    const dpd = daysPastDue(l.dueDate, now);
    const matured = !!l.dueDate && l.dueDate <= now;
    const cropName =
      l.product.cropIds.length === 1
        ? (crops.find((c) => c.id === l.product.cropIds[0])?.name ?? "Other")
        : l.product.cropIds.length
          ? "Several"
          : "Any";
    const keys: [Map<string, Bucket>, string][] = [
      [by.district, l.farmer.district.name],
      [by.gender, l.farmer.gender],
      [by.crop, cropName],
      [by.product, l.product.name],
    ];
    for (const b of [total, ...keys.map(([m, k]) => m.get(k) ?? (m.set(k, empty()), m.get(k)!))]) {
      b.loans++;
      b.disbursedLe = b.disbursedLe.plus(disbursed);
      b.outstandingLe = b.outstandingLe.plus(outstanding);
      if (dpd > 30 && outstanding.gt(0)) b.par30Le = b.par30Le.plus(outstanding);
      if (dpd > 90 && outstanding.gt(0)) b.par90Le = b.par90Le.plus(outstanding);
      if (matured && l.totalDueLe) {
        b.dueLe = b.dueLe.plus(l.totalDueLe);
        b.repaidOfDueLe = b.repaidOfDueLe.plus(Prisma.Decimal.min(l.repaidLe, l.totalDueLe));
      }
    }
  }
  const table = (m: Map<string, Bucket>) =>
    [...m.entries()].map(([key, b]) => ({ key, ...finish(b) })).sort((a, b) => b.loans - a.loans);
  const statusCounts = await prisma.loan.groupBy({
    by: ["status"],
    where: { lenderOrgId: orgId },
    _count: true,
  });
  return {
    total: finish(total),
    byDistrict: table(by.district),
    byGender: table(by.gender),
    byCrop: table(by.crop),
    byProduct: table(by.product),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
  };
}
