import "server-only";
import type { Prisma } from "@agripay/db";
import { type ConsentScope, type Tx, nextSequenceValue, prisma } from "@agripay/db";
import { bandAtLeast } from "@agripay/finance";
import {
  maskPhone,
  requestConsentSchema,
  respondConsentSchema,
  revokeConsentSchema,
  type RequestConsentInput,
} from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import {
  confirmFarmerPin,
  findFarmerByIdOrPhone,
  lenderOrgId,
  scopedFarmer,
} from "../finance/common";
import { sendSms } from "../sms";

export const REQUEST_TTL_DAYS = 30;
const SCOPE_TEXT: Record<ConsentScope, string> = {
  PASSPORT_SUMMARY: "your AgriPay score",
  PASSPORT_DETAILED: "your AgriPay passport (score, sales, savings and repayments)",
  RECORDS_FULL: "your AgriPay passport and all your farm records",
};

function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

async function nextRef(tx: Tx) {
  return `CON-${String(await nextSequenceValue(tx, "consent")).padStart(6, "0")}`;
}

/** A lender asks a farmer for consent. The farmer is found by AgriPay ID or exact phone only. */
export async function requestConsent(actor: Actor, input: RequestConsentInput) {
  if (!can(actor, "consent.request")) throw forbidden();
  const orgId = lenderOrgId(actor);
  const data = requestConsentSchema.parse(input);
  const farmer = await findFarmerByIdOrPhone(prisma, data.farmer);
  if (!farmer || farmer.status !== "ACTIVE")
    throw new AppError(
      "NOT_FOUND",
      "No farmer found with that AgriPay ID or phone. For shared phones use the AgriPay ID.",
    );
  const existing = await prisma.consentRequest.findFirst({
    where: {
      farmerId: farmer.id,
      requesterOrgId: orgId,
      scope: data.scope,
      OR: [{ status: "REQUESTED" }, { status: "GRANTED", expiresAt: { gt: new Date() } }],
    },
  });
  if (existing)
    return {
      request: existing,
      farmer: { agripayId: farmer.agripayId, phone: maskPhone(farmer.phone) },
      duplicate: true,
    };
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const request = await prisma.$transaction(async (tx) => {
    const r = await tx.consentRequest.create({
      data: {
        ref: await nextRef(tx),
        farmerId: farmer.id,
        requesterOrgId: orgId,
        requestedById: actor.userId,
        scope: data.scope,
        purpose: data.purpose,
        durationMonths: data.durationMonths,
      },
    });
    await audit(tx, {
      actor,
      action: "consent.requested",
      entity: "ConsentRequest",
      entityId: r.id,
      after: { ref: r.ref, farmer: farmer.agripayId, scope: data.scope, purpose: data.purpose },
    });
    return r;
  });
  await sendSms(
    farmer.phone,
    `AgriPay: ${org.name} wants to see ${SCOPE_TEXT[data.scope]} to ${data.purpose} for ${data.durationMonths} months. Open AgriPay to accept or decline. Ref ${request.ref}`,
    "general",
  );
  return {
    request,
    farmer: { agripayId: farmer.agripayId, phone: maskPhone(farmer.phone) },
    duplicate: false,
  };
}

async function consentForFarmer(actor: Actor, id: string) {
  if (!can(actor, "consent.manage") && actor.role !== "AGENT") throw forbidden();
  const c = await prisma.consentRequest.findUnique({
    where: { id },
    include: { requesterOrg: { select: { name: true } } },
  });
  if (!c) throw notFound("Consent request");
  if (actor.role === "FARMER") {
    if (actor.farmerId !== c.farmerId) throw notFound("Consent request");
  } else {
    // Agent-assisted: the agent must be able to see the farmer; the decision still needs the farmer's PIN.
    await scopedFarmer(prisma, actor, c.farmerId);
  }
  return c;
}

export async function respondConsent(
  actor: Actor,
  id: string,
  input: z.input<typeof respondConsentSchema>,
) {
  const data = respondConsentSchema.parse(input);
  const c = await consentForFarmer(actor, id);
  if (c.status !== "REQUESTED")
    throw new AppError("CONFLICT", "This request has already been answered.");
  if (c.createdAt.getTime() < Date.now() - REQUEST_TTL_DAYS * 86_400_000) {
    await prisma.consentRequest.update({ where: { id }, data: { status: "EXPIRED" } });
    throw new AppError("CONFLICT", "This request has expired.");
  }
  await confirmFarmerPin(c.farmerId, data.pin);
  const now = new Date();
  const grant = data.decision === "GRANT";
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.consentRequest.updateMany({
      where: { id, status: "REQUESTED" },
      data: grant
        ? {
            status: "GRANTED",
            grantedAt: now,
            respondedAt: now,
            expiresAt: addMonths(now, c.durationMonths),
            channel: actor.role === "FARMER" ? "APP" : "AGENT_ASSISTED",
          }
        : {
            status: "DECLINED",
            respondedAt: now,
            channel: actor.role === "FARMER" ? "APP" : "AGENT_ASSISTED",
          },
    });
    if (claimed.count !== 1)
      throw new AppError("CONFLICT", "This request has already been answered.");
    await audit(tx, {
      actor,
      action: grant ? "consent.granted" : "consent.declined",
      entity: "ConsentRequest",
      entityId: id,
      after: { ref: c.ref, org: c.requesterOrg.name, scope: c.scope, pinConfirmed: true },
    });
    return tx.consentRequest.findUniqueOrThrow({ where: { id } });
  });
}

/** Revoke stops future access immediately; existing loans are not affected. */
export async function revokeConsent(
  actor: Actor,
  id: string,
  input: z.input<typeof revokeConsentSchema>,
) {
  const data = revokeConsentSchema.parse(input);
  const c = await consentForFarmer(actor, id);
  if (c.status !== "GRANTED")
    throw new AppError("CONFLICT", "Only active permissions can be stopped.");
  await confirmFarmerPin(c.farmerId, data.pin);
  return prisma.$transaction(async (tx) => {
    const r = await tx.consentRequest.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await audit(tx, {
      actor,
      action: "consent.revoked",
      entity: "ConsentRequest",
      entityId: id,
      after: { ref: c.ref, org: c.requesterOrg.name, pinConfirmed: true },
    });
    return r;
  });
}

/** Applying for a loan (PIN already confirmed) grants the lender a summary view for the loan's life. */
export async function grantConsentForApplication(
  tx: Tx,
  p: { farmerId: string; orgId: string; userId: string; purpose: string },
) {
  const now = new Date();
  const existing = await tx.consentRequest.findFirst({
    where: {
      farmerId: p.farmerId,
      requesterOrgId: p.orgId,
      status: "GRANTED",
      expiresAt: { gt: now },
    },
  });
  if (existing) return existing;
  return tx.consentRequest.create({
    data: {
      ref: await nextRef(tx),
      farmerId: p.farmerId,
      requesterOrgId: p.orgId,
      requestedById: p.userId,
      scope: "PASSPORT_DETAILED",
      purpose: p.purpose,
      status: "GRANTED",
      grantedAt: now,
      respondedAt: now,
      expiresAt: addMonths(now, 12),
      channel: "LOAN_APPLICATION",
    },
  });
}

export async function listFarmerConsents(actor: Actor, farmerId = actor.farmerId ?? "") {
  if (actor.role === "FARMER" && actor.farmerId !== farmerId) throw forbidden();
  if (actor.role !== "FARMER") await scopedFarmer(prisma, actor, farmerId);
  return prisma.consentRequest.findMany({
    where: { farmerId },
    orderBy: { createdAt: "desc" },
    include: {
      requesterOrg: { select: { name: true, type: true } },
      _count: { select: { accessLogs: true } },
    },
  });
}

/** Lender: requests sent and their status. */
export async function listLenderConsents(actor: Actor, status?: string) {
  if (!can(actor, "consent.request")) throw forbidden();
  const orgId = lenderOrgId(actor);
  return prisma.consentRequest.findMany({
    where: {
      requesterOrgId: orgId,
      ...(status ? { status: status as Prisma.ConsentRequestWhereInput["status"] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { farmer: { select: { id: true, agripayId: true, fullName: true } } },
  });
}

/** Lender: farmers who currently allow access, with their band. Filter by crop / district. */
export async function listConsentedFarmers(
  actor: Actor,
  filters: { cropId?: string; districtId?: string; minBand?: string } = {},
) {
  if (!can(actor, "passport.read")) throw forbidden();
  const orgId = lenderOrgId(actor);
  const grants = await prisma.consentRequest.findMany({
    where: {
      requesterOrgId: orgId,
      status: "GRANTED",
      expiresAt: { gt: new Date() },
      farmer: {
        ...(filters.districtId ? { districtId: filters.districtId } : {}),
        ...(filters.cropId
          ? { plots: { some: { cropCycles: { some: { cropId: filters.cropId } } } } }
          : {}),
      },
    },
    orderBy: { grantedAt: "desc" },
    include: {
      farmer: {
        select: {
          id: true,
          agripayId: true,
          fullName: true,
          district: { select: { name: true } },
          creditScores: {
            where: { isCurrent: true },
            select: { score: true, band: true, computedAt: true },
          },
          loans: {
            where: { lenderOrgId: orgId },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { ref: true, status: true },
          },
        },
      },
    },
  });
  const byFarmer = new Map<string, (typeof grants)[number]>();
  for (const g of grants) if (!byFarmer.has(g.farmerId)) byFarmer.set(g.farmerId, g);
  return [...byFarmer.values()]
    .map((g) => ({
      consent: { id: g.id, ref: g.ref, scope: g.scope, expiresAt: g.expiresAt },
      farmer: g.farmer,
      score: g.farmer.creditScores[0] ?? null,
      lastLoan: g.farmer.loans[0] ?? null,
    }))
    .filter((r) => !filters.minBand || (r.score && bandAtLeast(r.score.band, filters.minBand)));
}

/**
 * Eligible farmers for a product: named only when they consented; otherwise an anonymised count
 * (suppressed below 5 so nobody can be singled out).
 */
export async function searchEligibleFarmers(actor: Actor, productId: string) {
  const orgId = lenderOrgId(actor);
  const product = await prisma.loanProduct.findFirst({
    where: { id: productId, lenderOrgId: orgId },
  });
  if (!product) throw notFound("Loan product");
  const consented = await listConsentedFarmers(actor, { minBand: product.minBand });
  const where: Prisma.CreditScoreWhereInput = {
    isCurrent: true,
    farmer: {
      status: "ACTIVE",
      ...(product.districtIds.length ? { districtId: { in: product.districtIds } } : {}),
      ...(product.cropIds.length
        ? { plots: { some: { cropCycles: { some: { cropId: { in: product.cropIds } } } } } }
        : {}),
    },
  };
  const bands = await prisma.creditScore.groupBy({ by: ["band"], where, _count: true });
  const eligibleCount = bands
    .filter((b) => bandAtLeast(b.band, product.minBand))
    .reduce((s, b) => s + b._count, 0);
  const others = eligibleCount - consented.length;
  return {
    consented,
    anonymousEligible: others >= 5 ? others : null,
    suppressed: others > 0 && others < 5,
  };
}

/** Daily: expire grants past their end date and unanswered requests older than 30 days. */
export async function expireConsents(now = new Date()) {
  const grants = await prisma.consentRequest.updateMany({
    where: { status: "GRANTED", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  const requests = await prisma.consentRequest.updateMany({
    where: {
      status: "REQUESTED",
      createdAt: { lte: new Date(now.getTime() - REQUEST_TTL_DAYS * 86_400_000) },
    },
    data: { status: "EXPIRED" },
  });
  return { grantsExpired: grants.count, requestsExpired: requests.count };
}
