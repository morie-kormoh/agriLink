import "server-only";
import { Prisma, prisma } from "@agripay/db";
import {
  dealerItemSchema,
  dealerProfileSchema,
  normalizeSlPhone,
  type DealerItemInput,
  type DealerProfileInput,
} from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";

/** The agro-dealer record of the actor's organisation (null until the profile is completed). */
export async function dealerFor(actor: Actor, opts: { required?: boolean } = {}) {
  if (actor.role !== "AGRO_DEALER" || !actor.orgId) throw forbidden();
  const d = await prisma.agroDealer.findUnique({
    where: { orgId: actor.orgId },
    include: { org: true, district: { select: { name: true } } },
  });
  if (!d && opts.required)
    throw new AppError(
      "VALIDATION",
      "Complete your shop profile first.",
      "dealer.errors.noProfile",
    );
  return d;
}

export async function saveDealerProfile(actor: Actor, input: DealerProfileInput) {
  if (!can(actor, "dealer.manage") || actor.role !== "AGRO_DEALER" || !actor.orgId)
    throw forbidden();
  const data = dealerProfileSchema.parse(input);
  const msisdn = normalizeSlPhone(data.payoutMsisdn);
  if (!msisdn) throw new AppError("VALIDATION", "Enter a valid Sierra Leone mobile number.");
  return prisma.$transaction(async (tx) => {
    const before = await tx.agroDealer.findUnique({ where: { orgId: actor.orgId! } });
    // Changing the payout number needs re-verification (protects against account takeover redirecting money).
    const reverify = !!before && before.payoutMsisdn !== msisdn;
    const d = await tx.agroDealer.upsert({
      where: { orgId: actor.orgId! },
      create: {
        orgId: actor.orgId!,
        districtId: data.districtId,
        payoutMsisdn: msisdn,
        payoutProvider: data.payoutProvider,
      },
      update: {
        districtId: data.districtId,
        payoutMsisdn: msisdn,
        payoutProvider: data.payoutProvider,
        ...(reverify ? { verified: false, verifiedAt: null } : {}),
      },
    });
    await audit(tx, {
      actor,
      action: "dealer.profile_saved",
      entity: "AgroDealer",
      entityId: d.id,
      before,
      after: { ...data, payoutMsisdn: msisdn, reverify },
    });
    return d;
  });
}

export async function listCatalogue(actor: Actor, opts: { activeOnly?: boolean } = {}) {
  const d = await dealerFor(actor);
  if (!d) return [];
  return prisma.dealerItem.findMany({
    where: { dealerId: d.id, ...(opts.activeOnly ? { active: true } : {}) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function saveDealerItem(actor: Actor, input: DealerItemInput, id?: string) {
  if (!can(actor, "dealer.manage")) throw forbidden();
  const d = (await dealerFor(actor, { required: true }))!;
  const data = dealerItemSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    if (id) {
      const before = await tx.dealerItem.findFirst({ where: { id, dealerId: d.id } });
      if (!before) throw notFound("Item");
      const item = await tx.dealerItem.update({ where: { id }, data });
      await audit(tx, {
        actor,
        action: "dealer.item_updated",
        entity: "DealerItem",
        entityId: id,
        before,
        after: data,
      });
      return item;
    }
    const item = await tx.dealerItem.create({ data: { ...data, dealerId: d.id } });
    await audit(tx, {
      actor,
      action: "dealer.item_created",
      entity: "DealerItem",
      entityId: item.id,
      after: data,
    });
    return item;
  });
}

export async function dealerRedemptions(actor: Actor) {
  const d = await dealerFor(actor);
  if (!d)
    return {
      dealer: null,
      items: [],
      totals: { redeemedLe: "0.00", settledLe: "0.00", pendingLe: "0.00" },
    };
  const items = await prisma.voucherRedemption.findMany({
    where: { dealerId: d.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      voucher: { select: { code: true, farmer: { select: { fullName: true, agripayId: true } } } },
    },
  });
  const payments = await prisma.payment.findMany({
    where: { id: { in: items.map((i) => i.settlementPaymentId).filter((x): x is string => !!x) } },
    select: { id: true, ref: true, status: true },
  });
  const sum = (xs: typeof items) =>
    xs.reduce((s, i) => s.plus(i.amountLe), new Prisma.Decimal(0)).toFixed(2);
  return {
    dealer: d,
    items: items.map((i) => ({
      ...i,
      payment: payments.find((p) => p.id === i.settlementPaymentId) ?? null,
    })),
    totals: {
      redeemedLe: sum(items),
      settledLe: sum(items.filter((i) => i.settledAt)),
      pendingLe: sum(items.filter((i) => !i.settledAt)),
    },
  };
}

/** Dealers lenders can choose for a product (verified only). */
export async function listVerifiedDealers() {
  return prisma.agroDealer.findMany({
    where: { verified: true },
    include: { org: { select: { name: true } }, district: { select: { name: true } } },
    orderBy: { org: { name: "asc" } },
  });
}

/** Admin: all dealers with verification state. */
export async function listDealersForAdmin(actor: Actor) {
  if (actor.role !== "SUPER_ADMIN") throw forbidden();
  return prisma.agroDealer.findMany({
    include: {
      org: { select: { name: true, phone: true } },
      district: { select: { name: true } },
      _count: { select: { catalogue: true, redemptions: true } },
    },
    orderBy: { verified: "asc" },
  });
}

export async function setDealerVerified(actor: Actor, dealerId: string, verified: boolean) {
  if (actor.role !== "SUPER_ADMIN") throw forbidden();
  return prisma.$transaction(async (tx) => {
    const d = await tx.agroDealer.update({
      where: { id: dealerId },
      data: { verified, verifiedAt: verified ? new Date() : null },
    });
    await audit(tx, {
      actor,
      action: verified ? "dealer.verified" : "dealer.unverified",
      entity: "AgroDealer",
      entityId: dealerId,
    });
    return d;
  });
}
