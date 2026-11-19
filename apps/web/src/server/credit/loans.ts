import "server-only";
import { type Db, Prisma, type Tx, nextSequenceValue, prisma } from "@agrilink/db";
import {
  arrearsTransition,
  disclosure,
  graduationLimit,
  loanCost,
  loanDueDate,
} from "@agrilink/finance";
import {
  acceptLoanSchema,
  applyLoanSchema,
  currentSeason,
  declineLoanSchema,
  formatLe,
  makeOfferSchema,
  manualRepaymentSchema,
  markDefaultSchema,
  restructureSchema,
  type ApplyLoanInput,
} from "@agrilink/validation";
import { type Actor, can } from "@agrilink/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { emit } from "../events";
import { confirmFarmerPin, lenderOrgId } from "../finance/common";
import { grantConsentForApplication } from "../passport/consent";
import { accountCodes, postJournal } from "../payments/ledger";
import { sendSms } from "../sms";
import { checkEligibility } from "./eligibility";
import { issueVoucher, voucherSms } from "./vouchers";

/** Loan repayment comes first in the waterfall (module 04), before savings and dues. */
export const LOAN_PRIORITY = 1;
export const COOLING_OFF_MS = 24 * 3_600_000;
const OPEN_STATUSES = ["DISBURSED", "REPAYING", "LATE", "RESTRUCTURED", "DEFAULTED"] as const;
const isLender = (a: Actor) => a.role === "LENDER_ADMIN" || a.role === "LENDER_OFFICER";

export function loanScope(actor: Actor): Prisma.LoanWhereInput {
  if (!can(actor, "loan.read")) throw forbidden();
  if (actor.role === "SUPER_ADMIN") return {};
  if (actor.role === "FARMER") return { farmerId: actor.farmerId ?? "__none__" };
  if (isLender(actor)) return { lenderOrgId: lenderOrgId(actor) };
  throw forbidden();
}

async function loanFor(db: Db, actor: Actor, id: string) {
  const loan = await db.loan.findFirst({
    where: { AND: [{ id }, loanScope(actor)] },
    include: {
      product: { include: { lenderOrg: { select: { name: true } } } },
      farmer: true,
      voucher: true,
    },
  });
  if (!loan) throw notFound("Loan");
  return loan;
}

function outstandingOf(l: { totalDueLe: Prisma.Decimal | null; repaidLe: Prisma.Decimal }) {
  return Prisma.Decimal.max((l.totalDueLe ?? new Prisma.Decimal(0)).minus(l.repaidLe), 0);
}

async function nextLoanRef(tx: Tx) {
  return `LN-${String(await nextSequenceValue(tx, "loan")).padStart(6, "0")}`;
}

function assertAmount(
  amountLe: string,
  report: { eligible: boolean; reasons: string[]; limitLe: string; minAmountLe: string },
) {
  if (!report.eligible)
    throw new AppError(
      "VALIDATION",
      `Not eligible: ${report.reasons.join(", ")}`,
      "credit.errors.notEligible",
      { reasons: report.reasons },
    );
  const amount = new Prisma.Decimal(amountLe);
  if (amount.lt(report.minAmountLe))
    throw new AppError("VALIDATION", `The minimum is ${formatLe(report.minAmountLe)}.`);
  if (amount.gt(report.limitLe))
    throw new AppError(
      "VALIDATION",
      `The most you can borrow now is ${formatLe(report.limitLe)}.`,
      "credit.errors.overLimit",
      { limitLe: report.limitLe },
    );
}

// ---------------------------------------------------------------------------
// Farmer: offers, eligibility, applying
// ---------------------------------------------------------------------------

export async function farmerLoanOverview(actor: Actor) {
  if (actor.role !== "FARMER" || !actor.farmerId) throw forbidden();
  const farmerId = actor.farmerId;
  const [loans, products] = await Promise.all([
    prisma.loan.findMany({
      where: { farmerId },
      orderBy: { createdAt: "desc" },
      include: {
        product: { include: { lenderOrg: { select: { name: true } } } },
        voucher: {
          include: {
            redemptions: {
              include: { dealer: { include: { org: { select: { name: true } } } } },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        repayments: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    }),
    prisma.loanProduct.findMany({
      where: { active: true },
      include: { lenderOrg: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const eligibility = await Promise.all(
    products.map((p) => checkEligibility(prisma, farmerId, p.id, { consentRequired: false })),
  );
  const dealerIds = [...new Set(loans.flatMap((l) => l.voucher?.allowedDealerIds ?? []))];
  const dealers = await prisma.agroDealer.findMany({
    where: { verified: true, ...(dealerIds.length ? { id: { in: dealerIds } } : {}) },
    include: { org: { select: { name: true, phone: true } }, district: { select: { name: true } } },
    take: 20,
  });
  return {
    loans: loans.map((l) => ({ ...l, outstandingLe: outstandingOf(l).toFixed(2) })),
    products: products.map((p, i) => ({ product: p, eligibility: eligibility[i]! })),
    dealers,
  };
}

/** Farmer applies with PIN after reading the disclosure. Applying shares the passport with that lender. */
export async function applyForLoan(actor: Actor, input: ApplyLoanInput) {
  if (!can(actor, "loan.apply") || !actor.farmerId) throw forbidden();
  const data = applyLoanSchema.parse(input);
  const farmerId = actor.farmerId;
  const product = await prisma.loanProduct.findUnique({
    where: { id: data.productId },
    include: { lenderOrg: true },
  });
  if (!product?.active) throw notFound("Loan product");
  const report = await checkEligibility(prisma, farmerId, product.id, { consentRequired: false });
  assertAmount(data.amountLe, report);
  await confirmFarmerPin(farmerId, data.pin);
  const disc = disclosure({
    lenderName: product.lenderOrg.name,
    productName: product.name,
    principalLe: data.amountLe,
    flatFeePct: product.flatFeePct.toString(),
    maxRepaymentPctPerSale: product.maxRepaymentPctPerSale.toString(),
    dueDate: loanDueDate(product.dueMonthDay, new Date()),
    voucherValidDays: product.voucherValidDays,
  });
  const loan = await prisma.$transaction(async (tx) => {
    const consent = await grantConsentForApplication(tx, {
      farmerId,
      orgId: product.lenderOrgId,
      userId: actor.userId,
      purpose: `Loan application: ${product.name}`,
    });
    const group = product.requiresGroupGuarantee
      ? await tx.savingsGroupMember.findFirst({ where: { farmerId }, select: { groupId: true } })
      : null;
    const l = await tx.loan.create({
      data: {
        ref: await nextLoanRef(tx),
        farmerId,
        productId: product.id,
        lenderOrgId: product.lenderOrgId,
        status: "APPLIED",
        requestedLe: data.amountLe,
        season: currentSeason(),
        scoreAtApplication: report.score,
        bandAtApplication: report.band as never,
        affordability: report as unknown as Prisma.InputJsonValue,
        disclosure: disc as unknown as Prisma.InputJsonValue,
        disclosureAcceptedAt: new Date(),
        acceptedVia: "APP",
        appliedVia: "FARMER_APPLICATION",
        consentId: consent.id,
        groupId: group?.groupId ?? null,
      },
    });
    await audit(tx, {
      actor,
      action: "loan.applied",
      entity: "Loan",
      entityId: l.id,
      after: {
        ref: l.ref,
        product: product.name,
        amountLe: data.amountLe,
        band: report.band,
        pinConfirmed: true,
        consent: consent.ref,
      },
    });
    return l;
  });
  const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: farmerId } });
  await sendSms(
    farmer.phone,
    `AgriLink: your application ${loan.ref} for ${formatLe(data.amountLe)} with ${product.lenderOrg.name} was received. We will SMS you when it is approved.`,
    "general",
  );
  return loan;
}

/** Lender offers a loan to a consented, eligible farmer. The farmer must still accept with PIN. */
export async function makeOffer(actor: Actor, input: z.input<typeof makeOfferSchema>) {
  if (!can(actor, "loan.offer")) throw forbidden();
  const orgId = lenderOrgId(actor);
  const data = makeOfferSchema.parse(input);
  const product = await prisma.loanProduct.findFirst({
    where: { id: data.productId, lenderOrgId: orgId },
    include: { lenderOrg: true },
  });
  if (!product?.active) throw notFound("Loan product");
  const report = await checkEligibility(prisma, data.farmerId, product.id, {
    consentRequired: true,
  });
  assertAmount(data.amountLe, report);
  const disc = disclosure({
    lenderName: product.lenderOrg.name,
    productName: product.name,
    principalLe: data.amountLe,
    flatFeePct: product.flatFeePct.toString(),
    maxRepaymentPctPerSale: product.maxRepaymentPctPerSale.toString(),
    dueDate: loanDueDate(product.dueMonthDay, new Date()),
    voucherValidDays: product.voucherValidDays,
  });
  const loan = await prisma.$transaction(async (tx) => {
    const l = await tx.loan.create({
      data: {
        ref: await nextLoanRef(tx),
        farmerId: data.farmerId,
        productId: product.id,
        lenderOrgId: orgId,
        status: "OFFERED",
        requestedLe: data.amountLe,
        season: currentSeason(),
        scoreAtApplication: report.score,
        bandAtApplication: report.band as never,
        affordability: report as unknown as Prisma.InputJsonValue,
        disclosure: disc as unknown as Prisma.InputJsonValue,
        appliedVia: "LENDER_OFFER",
        offeredById: actor.userId,
      },
    });
    await audit(tx, {
      actor,
      action: "loan.offered",
      entity: "Loan",
      entityId: l.id,
      after: { ref: l.ref, product: product.name, amountLe: data.amountLe },
    });
    return l;
  });
  const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: data.farmerId } });
  await sendSms(
    farmer.phone,
    `AgriLink: ${product.lenderOrg.name} offers you an input loan of ${formatLe(data.amountLe)}. Open AgriLink > Loans to read the terms and accept. Ref ${loan.ref}`,
    "general",
  );
  return loan;
}

export async function acceptOffer(
  actor: Actor,
  loanId: string,
  input: z.input<typeof acceptLoanSchema>,
) {
  const data = acceptLoanSchema.parse(input);
  const loan = await loanFor(prisma, actor, loanId);
  if (actor.role !== "FARMER") throw forbidden();
  if (loan.status !== "OFFERED")
    throw new AppError("CONFLICT", "This offer can no longer be accepted.");
  const report = await checkEligibility(prisma, loan.farmerId, loan.productId, {
    consentRequired: true,
    excludeLoanId: loan.id,
  });
  assertAmount(loan.requestedLe.toFixed(2), report);
  await confirmFarmerPin(loan.farmerId, data.pin);
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.loan.updateMany({
      where: { id: loan.id, status: "OFFERED" },
      data: { status: "ACCEPTED", disclosureAcceptedAt: new Date(), acceptedVia: "APP" },
    });
    if (claimed.count !== 1)
      throw new AppError("CONFLICT", "This offer can no longer be accepted.");
    await audit(tx, {
      actor,
      action: "loan.accepted",
      entity: "Loan",
      entityId: loan.id,
      after: { ref: loan.ref, pinConfirmed: true },
    });
    return tx.loan.findUniqueOrThrow({ where: { id: loan.id } });
  });
}

// ---------------------------------------------------------------------------
// Lender decisions (maker–checker)
// ---------------------------------------------------------------------------

/**
 * Approve → voucher issued, repayment rule registered, loan DISBURSED.
 * Rules: whoever made the offer cannot approve it; above the institution's threshold only a LENDER_ADMIN can.
 * Eligibility and affordability are checked again at approval time.
 */
export async function approveLoan(actor: Actor, loanId: string) {
  if (!can(actor, "loan.approve")) throw forbidden();
  const loan = await loanFor(prisma, actor, loanId);
  if (loan.status !== "APPLIED" && loan.status !== "ACCEPTED")
    throw new AppError("CONFLICT", "Only applications and accepted offers can be approved.");
  if (loan.offeredById === actor.userId)
    throw new AppError(
      "FORBIDDEN",
      "Someone else must approve a loan you offered (two-person rule).",
      "credit.errors.makerChecker",
    );
  const fi = await prisma.financialInstitution.findUnique({ where: { orgId: loan.lenderOrgId } });
  const threshold = fi?.approvalThresholdLe ?? new Prisma.Decimal(5000);
  if (loan.requestedLe.gt(threshold) && actor.role !== "LENDER_ADMIN") {
    throw new AppError(
      "FORBIDDEN",
      `Loans above ${formatLe(threshold.toFixed(2))} need a lender admin to approve.`,
      "credit.errors.overThreshold",
    );
  }
  const report = await checkEligibility(prisma, loan.farmerId, loan.productId, {
    consentRequired: true,
    excludeLoanId: loan.id,
  });
  assertAmount(loan.requestedLe.toFixed(2), report);

  const now = new Date();
  const product = loan.product;
  const cost = loanCost(loan.requestedLe.toFixed(2), product.flatFeePct.toString());
  const { voucher } = await prisma.$transaction(async (tx) => {
    const claimed = await tx.loan.updateMany({
      where: { id: loan.id, status: { in: ["APPLIED", "ACCEPTED"] } },
      data: { status: "APPROVED", approvedById: actor.userId, approvedAt: now },
    });
    if (claimed.count !== 1) throw new AppError("CONFLICT", "This loan was already decided.");
    const rule = await tx.splitRule.create({
      data: {
        farmerId: loan.farmerId,
        type: "LOAN_REPAYMENT",
        priority: LOAN_PRIORITY,
        mode: "OUTSTANDING_BALANCE",
        targetType: "LOAN",
        targetId: loan.id,
        consentRef: `LOAN:${loan.ref}`,
      },
    });
    const v = await issueVoucher(tx, {
      loanId: loan.id,
      farmerId: loan.farmerId,
      funderOrgId: loan.lenderOrgId,
      valueLe: cost.principalLe,
      allowedCategories: product.allowedCategories,
      allowedDealerIds: product.eligibleDealerIds,
      validDays: product.voucherValidDays,
    });
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        status: "DISBURSED",
        approvedLe: cost.principalLe,
        // Nothing is owed until the voucher is used: each redemption adds what was spent + its share of the fee.
        feeLe: "0.00",
        totalDueLe: "0.00",
        disbursedAt: now,
        coolingOffUntil: new Date(now.getTime() + COOLING_OFF_MS),
        dueDate: loanDueDate(product.dueMonthDay, now),
        splitRuleId: rule.id,
      },
    });
    await audit(tx, {
      actor,
      action: "loan.approved",
      entity: "Loan",
      entityId: loan.id,
      after: { ref: loan.ref, ...cost, voucher: v.code, band: report.band },
    });
    return { voucher: v };
  });
  await sendSms(loan.farmer.phone, await voucherSms(voucher.id), "general");
  await emit("score.stale", { farmerId: loan.farmerId });
  await emit("loan.statusChanged", { loanId: loan.id, status: "DISBURSED" });
  return prisma.loan.findUniqueOrThrow({ where: { id: loan.id }, include: { voucher: true } });
}

export async function declineLoan(
  actor: Actor,
  loanId: string,
  input: z.input<typeof declineLoanSchema>,
) {
  if (!can(actor, "loan.approve")) throw forbidden();
  const data = declineLoanSchema.parse(input);
  const loan = await loanFor(prisma, actor, loanId);
  if (!["APPLIED", "ACCEPTED", "OFFERED"].includes(loan.status))
    throw new AppError("CONFLICT", "This loan can no longer be declined.");
  await prisma.$transaction(async (tx) => {
    await tx.loan.update({
      where: { id: loan.id },
      data: { status: "DECLINED", declineReason: data.reason },
    });
    await audit(tx, {
      actor,
      action: "loan.declined",
      entity: "Loan",
      entityId: loan.id,
      after: { ref: loan.ref, reason: data.reason },
    });
  });
  if (loan.status !== "OFFERED") {
    await sendSms(
      loan.farmer.phone,
      `AgriLink: ${loan.product.lenderOrg.name} could not approve loan ${loan.ref}. Keep selling and saving through AgriLink to raise your score.`,
      "general",
    );
  }
}

/**
 * Farmer cancels: before approval at any time; after approval within the 24-hour cooling-off period
 * if the voucher is unused — then nothing is owed.
 */
export async function cancelLoan(
  actor: Actor,
  loanId: string,
  input: z.input<typeof acceptLoanSchema>,
) {
  const data = acceptLoanSchema.parse(input);
  const loan = await loanFor(prisma, actor, loanId);
  if (actor.role !== "FARMER") throw forbidden();
  const pre = ["APPLIED", "OFFERED", "ACCEPTED"].includes(loan.status);
  const cooling =
    loan.status === "DISBURSED" &&
    !!loan.coolingOffUntil &&
    loan.coolingOffUntil > new Date() &&
    !!loan.voucher &&
    loan.voucher.remainingLe.equals(loan.voucher.valueLe);
  if (!pre && !cooling)
    throw new AppError(
      "CONFLICT",
      "This loan can no longer be cancelled (the 24-hour window has passed or the voucher was used).",
      "credit.errors.cannotCancel",
    );
  await confirmFarmerPin(loan.farmerId, data.pin);
  await prisma.$transaction(async (tx) => {
    if (cooling) {
      await tx.$queryRaw`SELECT id FROM "InputVoucher" WHERE id = ${loan.voucher!.id} FOR UPDATE`;
      const v = await tx.inputVoucher.findUniqueOrThrow({ where: { id: loan.voucher!.id } });
      if (!v.remainingLe.equals(v.valueLe) || v.status !== "ISSUED")
        throw new AppError("CONFLICT", "The voucher has already been used.");
      await tx.inputVoucher.update({
        where: { id: v.id },
        data: { status: "CANCELLED", closedAt: new Date() },
      });
      if (loan.splitRuleId)
        await tx.splitRule.update({ where: { id: loan.splitRuleId }, data: { active: false } });
    }
    await tx.loan.update({
      where: { id: loan.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await audit(tx, {
      actor,
      action: "loan.cancelled",
      entity: "Loan",
      entityId: loan.id,
      after: { ref: loan.ref, coolingOff: cooling, pinConfirmed: true },
    });
  });
  await emit("score.stale", { farmerId: loan.farmerId });
}

// ---------------------------------------------------------------------------
// Servicing
// ---------------------------------------------------------------------------

/** Lender records a repayment received outside the harvest split (e.g. farmer paid by mobile money). */
export async function recordManualRepayment(
  actor: Actor,
  loanId: string,
  input: z.input<typeof manualRepaymentSchema>,
) {
  if (!can(actor, "loan.approve")) throw forbidden();
  const data = manualRepaymentSchema.parse(input);
  const loan = await loanFor(prisma, actor, loanId);
  if (!(OPEN_STATUSES as readonly string[]).includes(loan.status))
    throw new AppError("CONFLICT", "This loan is not being repaid.");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Loan" WHERE id = ${loan.id} FOR UPDATE`;
    const l = await tx.loan.findUniqueOrThrow({ where: { id: loan.id } });
    const amount = new Prisma.Decimal(data.amountLe);
    if (amount.gt(outstandingOf(l)))
      throw new AppError("VALIDATION", `Only ${formatLe(outstandingOf(l).toFixed(2))} is owed.`);
    const dup = await tx.loanRepayment.findFirst({
      where: { loanId: l.id, reference: data.reference },
    });
    if (dup) throw new AppError("CONFLICT", "This transaction reference was already recorded.");
    const rp = await tx.loanRepayment.create({
      data: {
        loanId: l.id,
        amountLe: amount,
        source: "MANUAL_MOBILE_MONEY",
        reference: data.reference,
      },
    });
    await postJournal(tx, [
      {
        accountCode: accountCodes.farmerWallet(loan.farmer.agrilinkId),
        ownerType: "FARMER",
        ownerId: loan.farmerId,
        name: `${loan.farmer.fullName} wallet`,
        debitLe: amount.toFixed(2),
        memo: `${l.ref} · ${data.reference}`,
      },
      {
        accountCode: accountCodes.loan(l.id),
        ownerType: "LOAN",
        ownerId: l.id,
        name: "Loan repayments",
        creditLe: amount.toFixed(2),
        memo: `${l.ref} · ${data.reference}`,
      },
    ]);
    const repaid = l.repaidLe.plus(amount);
    const outstanding = Prisma.Decimal.max((l.totalDueLe ?? repaid).minus(repaid), 0);
    const voucherOpen = await tx.inputVoucher.count({
      where: { loanId: l.id, status: { in: ["ISSUED", "PARTIALLY_REDEEMED"] } },
    });
    const full = outstanding.lte(0) && voucherOpen === 0;
    await tx.loan.update({
      where: { id: l.id },
      data: {
        repaidLe: repaid,
        ...(full
          ? { status: "REPAID", repaidAt: new Date() }
          : l.status === "DISBURSED"
            ? { status: "REPAYING" }
            : {}),
      },
    });
    if (full && l.splitRuleId)
      await tx.splitRule.update({ where: { id: l.splitRuleId }, data: { active: false } });
    await audit(tx, {
      actor,
      action: "loan.manual_repayment",
      entity: "Loan",
      entityId: l.id,
      after: { amountLe: data.amountLe, reference: data.reference },
    });
    return { repayment: rp, outstandingLe: outstanding.toFixed(2), fullyRepaid: full };
  });
  await notifyRepayment({
    loanId: loan.id,
    amountLe: data.amountLe,
    outstandingLe: result.outstandingLe,
    fullyRepaid: result.fullyRepaid,
  });
  return result;
}

/** SMS after a repayment; on full repayment tell the farmer their new limit (graduation). */
export async function notifyRepayment(e: {
  loanId: string;
  amountLe: string;
  outstandingLe: string;
  fullyRepaid: boolean;
}) {
  const loan = await prisma.loan.findUnique({
    where: { id: e.loanId },
    include: { farmer: true, product: true },
  });
  if (!loan) return;
  let msg = `AgriLink: ${formatLe(e.amountLe)} paid to your loan ${loan.ref}. Remaining ${formatLe(e.outstandingLe)}.`;
  if (e.fullyRepaid) {
    const onTime = await prisma.loan.count({
      where: {
        farmerId: loan.farmerId,
        lenderOrgId: loan.lenderOrgId,
        status: "REPAID",
        lateAt: null,
      },
    });
    const limit = graduationLimit({
      firstCycleMaxLe: loan.product.firstCycleMaxLe.toString(),
      maxAmountLe: loan.product.maxAmountLe.toString(),
      graduationPct: loan.product.graduationPct.toString(),
      onTimeCycles: onTime,
    });
    msg += loan.lateAt
      ? " Loan fully repaid — thank you!"
      : ` Loan fully repaid! Your new limit is ${formatLe(limit)}.`;
  }
  await sendSms(loan.farmer.phone, msg, "general");
  await emit("score.stale", { farmerId: loan.farmerId });
}

/** Only after 90+ days past due, and only by a lender admin. */
export async function markDefault(
  actor: Actor,
  loanId: string,
  input: z.input<typeof markDefaultSchema>,
) {
  if (actor.role !== "LENDER_ADMIN") throw forbidden();
  const data = markDefaultSchema.parse(input);
  const loan = await loanFor(prisma, actor, loanId);
  const t = arrearsTransition({
    status: loan.status,
    dueDate: loan.dueDate,
    outstandingLe: outstandingOf(loan).toFixed(2),
    now: new Date(),
  });
  if (!t.canDefault)
    throw new AppError(
      "CONFLICT",
      "A loan can be marked defaulted only when more than 90 days past due with money owed.",
    );
  await prisma.$transaction(async (tx) => {
    await tx.loan.update({
      where: { id: loan.id },
      data: { status: "DEFAULTED", defaultedAt: new Date() },
    });
    await audit(tx, {
      actor,
      action: "loan.defaulted",
      entity: "Loan",
      entityId: loan.id,
      after: { ref: loan.ref, daysPastDue: t.daysPastDue, reason: data.reason },
    });
  });
  await emit("score.stale", { farmerId: loan.farmerId });
}

/** Lender proposes a new due date; it applies only when the farmer accepts with PIN. */
export async function proposeRestructure(
  actor: Actor,
  loanId: string,
  input: z.input<typeof restructureSchema>,
) {
  if (actor.role !== "LENDER_ADMIN") throw forbidden();
  const data = restructureSchema.parse(input);
  const loan = await loanFor(prisma, actor, loanId);
  if (!(OPEN_STATUSES as readonly string[]).includes(loan.status))
    throw new AppError("CONFLICT", "Only active loans can be restructured.");
  if (data.dueDate <= new Date())
    throw new AppError("VALIDATION", "The new due date must be in the future.");
  await prisma.$transaction(async (tx) => {
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        pendingRestructure: {
          dueDate: data.dueDate.toISOString(),
          reason: data.reason,
          proposedById: actor.userId,
        },
      },
    });
    await audit(tx, {
      actor,
      action: "loan.restructure_proposed",
      entity: "Loan",
      entityId: loan.id,
      after: { dueDate: data.dueDate, reason: data.reason },
    });
  });
  await sendSms(
    loan.farmer.phone,
    `AgriLink: ${loan.product.lenderOrg.name} offers to move the due date of loan ${loan.ref} to ${data.dueDate.toLocaleDateString("en-GB", { timeZone: "UTC" })}. No extra fee. Open AgriLink > Loans to accept.`,
    "general",
  );
}

export async function acceptRestructure(
  actor: Actor,
  loanId: string,
  input: z.input<typeof acceptLoanSchema>,
) {
  const data = acceptLoanSchema.parse(input);
  const loan = await loanFor(prisma, actor, loanId);
  if (actor.role !== "FARMER") throw forbidden();
  const proposal = loan.pendingRestructure as { dueDate: string; reason: string } | null;
  if (!proposal) throw new AppError("CONFLICT", "There is no new proposal for this loan.");
  await confirmFarmerPin(loan.farmerId, data.pin);
  await prisma.$transaction(async (tx) => {
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        dueDate: new Date(proposal.dueDate),
        status: "RESTRUCTURED",
        pendingRestructure: Prisma.DbNull,
      },
    });
    await audit(tx, {
      actor,
      action: "loan.restructured",
      entity: "Loan",
      entityId: loan.id,
      before: { dueDate: loan.dueDate, status: loan.status },
      after: { dueDate: proposal.dueDate, pinConfirmed: true },
    });
  });
}

/**
 * Daily: due-date reminders (7 days before), LATE after due + 14 days, then at most one reminder a week.
 * Collections conduct: SMS to the borrower only — never to anyone else.
 */
export async function runArrearsJob(now = new Date()) {
  const loans = await prisma.loan.findMany({
    where: {
      status: { in: ["DISBURSED", "REPAYING", "RESTRUCTURED", "LATE"] },
      dueDate: { not: null },
    },
    include: { farmer: true, product: { include: { lenderOrg: { select: { name: true } } } } },
  });
  let late = 0;
  let reminders = 0;
  const week = 7 * 86_400_000;
  for (const l of loans) {
    const outstanding = outstandingOf(l);
    if (outstanding.lte(0)) continue;
    const t = arrearsTransition({
      status: l.status,
      dueDate: l.dueDate,
      outstandingLe: outstanding.toFixed(2),
      now,
    });
    const recentlyReminded = l.lastReminderAt && now.getTime() - l.lastReminderAt.getTime() < week;
    if (t.next === "LATE") {
      await prisma.$transaction(async (tx) => {
        await tx.loan.update({
          where: { id: l.id },
          data: { status: "LATE", lateAt: l.lateAt ?? now, lastReminderAt: now },
        });
        await audit(tx, {
          actor: null,
          action: "loan.late",
          entity: "Loan",
          entityId: l.id,
          after: { daysPastDue: t.daysPastDue, outstandingLe: outstanding.toFixed(2) },
        });
      });
      late++;
      await sendSms(
        l.farmer.phone,
        `AgriLink: loan ${l.ref} is ${t.daysPastDue} days past due. ${formatLe(outstanding.toFixed(2))} is still owed. Sell through AgriLink or pay by mobile money to repay. Call your co-op if you need help.`,
        "general",
      );
      await emit("score.stale", { farmerId: l.farmerId });
      continue;
    }
    const daysToDue = Math.ceil((l.dueDate!.getTime() - now.getTime()) / 86_400_000);
    const dueSoon = daysToDue > 0 && daysToDue <= 7;
    if ((dueSoon || l.status === "LATE") && !recentlyReminded) {
      await prisma.loan.update({ where: { id: l.id }, data: { lastReminderAt: now } });
      reminders++;
      await sendSms(
        l.farmer.phone,
        dueSoon
          ? `AgriLink reminder: loan ${l.ref} is due on ${l.dueDate!.toLocaleDateString("en-GB", { timeZone: "UTC" })}. ${formatLe(outstanding.toFixed(2))} left to repay.`
          : `AgriLink reminder: loan ${l.ref} still has ${formatLe(outstanding.toFixed(2))} to repay. Call your co-op if you need help.`,
        "general",
      );
    }
  }
  return { checked: loans.length, late, reminders };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listLoans(
  actor: Actor,
  opts: { status?: string[]; queue?: boolean; page?: number } = {},
) {
  const where: Prisma.LoanWhereInput = {
    ...loanScope(actor),
    ...(opts.queue
      ? { status: { in: ["APPLIED", "ACCEPTED", "OFFERED"] } }
      : opts.status?.length
        ? { status: { in: opts.status as never[] } }
        : {}),
  };
  const page = opts.page ?? 1;
  const [total, items] = await Promise.all([
    prisma.loan.count({ where }),
    prisma.loan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 50,
      take: 50,
      include: {
        farmer: {
          select: {
            id: true,
            agrilinkId: true,
            fullName: true,
            gender: true,
            district: { select: { name: true } },
          },
        },
        product: { select: { name: true } },
        voucher: { select: { code: true, status: true, remainingLe: true, valueLe: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / 50)),
    items: items.map((l) => ({ ...l, outstandingLe: outstandingOf(l).toFixed(2) })),
  };
}

export async function getLoan(actor: Actor, id: string) {
  const loan = await prisma.loan.findFirst({
    where: { AND: [{ id }, loanScope(actor)] },
    include: {
      farmer: {
        select: {
          id: true,
          agrilinkId: true,
          fullName: true,
          phone: true,
          district: { select: { name: true } },
        },
      },
      product: { include: { lenderOrg: { select: { name: true } } } },
      voucher: {
        include: {
          redemptions: {
            include: { dealer: { include: { org: { select: { name: true } } } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      repayments: { orderBy: { createdAt: "asc" } },
      group: { select: { id: true, name: true, ref: true } },
    },
  });
  if (!loan) throw notFound("Loan");
  const outstanding = outstandingOf(loan);
  const t = arrearsTransition({
    status: loan.status,
    dueDate: loan.dueDate,
    outstandingLe: outstanding.toFixed(2),
    now: new Date(),
  });
  type Ev = { at: Date; key: string; detail?: string };
  const ev: Ev[] = [
    {
      at: loan.createdAt,
      key: loan.appliedVia === "LENDER_OFFER" ? "offered" : "applied",
      detail: formatLe(loan.requestedLe.toFixed(2)),
    },
  ];
  if (loan.disclosureAcceptedAt && loan.appliedVia === "LENDER_OFFER")
    ev.push({ at: loan.disclosureAcceptedAt, key: "accepted" });
  if (loan.approvedAt) ev.push({ at: loan.approvedAt, key: "approved" });
  if (loan.voucher)
    ev.push({ at: loan.voucher.issuedAt, key: "voucher", detail: loan.voucher.code });
  for (const r of loan.voucher?.redemptions ?? [])
    ev.push({
      at: r.createdAt,
      key: "redeemed",
      detail: `${formatLe(r.amountLe.toFixed(2))} · ${r.dealer.org.name}`,
    });
  for (const r of loan.repayments)
    ev.push({
      at: r.createdAt,
      key: "repayment",
      detail: `${formatLe(r.amountLe.toFixed(2))} · ${r.source === "HARVEST_SPLIT" ? "harvest sale" : (r.reference ?? r.source)}`,
    });
  if (loan.lateAt) ev.push({ at: loan.lateAt, key: "late" });
  if (loan.defaultedAt) ev.push({ at: loan.defaultedAt, key: "defaulted" });
  if (loan.repaidAt) ev.push({ at: loan.repaidAt, key: "repaid" });
  if (loan.cancelledAt) ev.push({ at: loan.cancelledAt, key: "cancelled" });
  ev.sort((a, b) => a.at.getTime() - b.at.getTime());
  return {
    loan,
    outstandingLe: outstanding.toFixed(2),
    daysPastDue: t.daysPastDue,
    canDefault: t.canDefault,
    timeline: ev,
  };
}
