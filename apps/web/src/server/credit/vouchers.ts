import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, type Tx, nextSequenceValue, prisma } from "@agripay/db";
import {
  formatVoucherCode,
  generateVoucherCode,
  isValidVoucherCode,
  loanCost,
  normalizeVoucherCode,
} from "@agripay/finance";
import {
  formatLe,
  redeemVoucherSchema,
  redemptionOtpSchema,
  type RedeemVoucherInput,
} from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { issueOtpCode, verifyOtp } from "../auth/otp";
import { AppError, forbidden, notFound } from "../errors";
import { emit } from "../events";
import { createDirectPayment, dispatchPayments } from "../payments/service";
import { hitRateLimit } from "../rate-limit";
import { sendSms } from "../sms";
import { dealerFor } from "./dealers";

const DAY = 86_400_000;

export async function issueVoucher(
  tx: Tx,
  p: {
    loanId: string | null;
    farmerId: string;
    funderOrgId: string;
    valueLe: string;
    allowedCategories: string[];
    allowedDealerIds: string[];
    validDays: number;
  },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateVoucherCode((n) => randomBytes(n));
    const clash = await tx.inputVoucher.findUnique({ where: { code } });
    if (clash) continue;
    return tx.inputVoucher.create({
      data: {
        code,
        loanId: p.loanId,
        farmerId: p.farmerId,
        funderOrgId: p.funderOrgId,
        valueLe: p.valueLe,
        remainingLe: p.valueLe,
        allowedCategories: p.allowedCategories,
        allowedDealerIds: p.allowedDealerIds,
        expiresAt: new Date(Date.now() + p.validDays * DAY),
      },
    });
  }
  throw new Error("Could not allocate a voucher code");
}

export async function voucherSms(voucherId: string) {
  const v = await prisma.inputVoucher.findUniqueOrThrow({ where: { id: voucherId } });
  const dealers = await prisma.agroDealer.findMany({
    where: {
      verified: true,
      ...(v.allowedDealerIds.length ? { id: { in: v.allowedDealerIds } } : {}),
    },
    include: { org: { select: { name: true } } },
    take: 3,
  });
  const where = dealers.length
    ? dealers.map((d) => d.org.name).join(", ")
    : "registered agro-dealers";
  return `AgriPay input voucher: ${formatVoucherCode(v.code)}, ${formatLe(v.valueLe.toFixed(2))}, valid to ${v.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} at ${where}. Show this code to the dealer. Never share the confirmation code you get by SMS with anyone else.`;
}

const firstNameAndInitial = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1]![0]}.` : (first ?? "");
};

async function usableVoucher(dealer: { id: string; verified: boolean }, rawCode: string) {
  if (!dealer.verified)
    throw new AppError(
      "FORBIDDEN",
      "Your shop must be verified by AgriPay before redeeming vouchers.",
      "dealer.errors.notVerified",
    );
  if (!isValidVoucherCode(rawCode))
    throw new AppError(
      "VALIDATION",
      "That voucher code is not valid. Check it with the farmer.",
      "dealer.errors.badCode",
    );
  const v = await prisma.inputVoucher.findUnique({
    where: { code: normalizeVoucherCode(rawCode) },
    include: { farmer: true },
  });
  if (!v) throw new AppError("NOT_FOUND", "Voucher not found.", "dealer.errors.notFound");
  if (v.status === "EXPIRED" || v.expiresAt <= new Date())
    throw new AppError("CONFLICT", "This voucher has expired.");
  if (v.status !== "ISSUED" && v.status !== "PARTIALLY_REDEEMED")
    throw new AppError("CONFLICT", "This voucher can no longer be used.");
  if (v.allowedDealerIds.length && !v.allowedDealerIds.includes(dealer.id))
    throw new AppError("FORBIDDEN", "This voucher cannot be used at your shop.");
  return v;
}

async function priceItems(
  dealerId: string,
  allowedCategories: string[],
  items: { itemId: string; qty: number }[],
) {
  const catalogue = await prisma.dealerItem.findMany({
    where: { dealerId, active: true, id: { in: items.map((i) => i.itemId) } },
  });
  const lines = items.map((i) => {
    const item = catalogue.find((c) => c.id === i.itemId);
    if (!item) throw new AppError("VALIDATION", "An item is not in your active catalogue.");
    if (allowedCategories.length && !allowedCategories.includes(item.category))
      throw new AppError(
        "VALIDATION",
        `${item.name}: ${item.category.toLowerCase()} is not allowed on this voucher.`,
      );
    const total = item.unitPriceLe.mul(i.qty);
    return {
      itemId: item.id,
      name: item.name,
      category: item.category,
      qty: i.qty,
      unitPriceLe: item.unitPriceLe.toFixed(2),
      totalLe: total.toFixed(2),
    };
  });
  const amount = lines.reduce((s, l) => s.plus(l.totalLe), new Prisma.Decimal(0));
  return { lines, amount };
}

/** Step 1 at the counter: what can this voucher buy here? (shows only first name + initial) */
export async function lookupVoucher(actor: Actor, code: string) {
  if (!can(actor, "voucher.redeem")) throw forbidden();
  const dealer = await dealerFor(actor, { required: true });
  const v = await usableVoucher(dealer!, code);
  const funder = await prisma.organization.findUnique({
    where: { id: v.funderOrgId },
    select: { name: true },
  });
  return {
    code: formatVoucherCode(v.code),
    farmerName: firstNameAndInitial(v.farmer.fullName),
    agripayId: v.farmer.agripayId,
    remainingLe: v.remainingLe.toFixed(2),
    valueLe: v.valueLe.toFixed(2),
    allowedCategories: v.allowedCategories,
    expiresAt: v.expiresAt,
    funder: funder?.name ?? "",
  };
}

/** Step 2: send the farmer an SMS code that confirms exactly these items and this amount. */
export async function requestRedemptionOtp(
  actor: Actor,
  input: z.input<typeof redemptionOtpSchema>,
) {
  if (!can(actor, "voucher.redeem")) throw forbidden();
  const data = redemptionOtpSchema.parse(input);
  const dealer = (await dealerFor(actor, { required: true }))!;
  const v = await usableVoucher(dealer, data.code);
  const { lines, amount } = await priceItems(dealer.id, v.allowedCategories, data.items);
  if (amount.gt(v.remainingLe))
    throw new AppError(
      "VALIDATION",
      `Only ${formatLe(v.remainingLe.toFixed(2))} is left on this voucher.`,
    );
  const rl = await hitRateLimit(`voucher-otp:${v.id}`, 5, 15 * 60);
  if (!rl.allowed)
    throw new AppError(
      "RATE_LIMITED",
      "Too many codes sent for this voucher. Try again in 15 minutes.",
    );
  const otp = await issueOtpCode(v.farmer.phone, "VOUCHER_REDEEM");
  const what = lines.map((l) => `${l.name} x${l.qty}`).join(", ");
  await sendSms(
    v.farmer.phone,
    `AgriPay: ${dealer.org.name} wants to use ${formatLe(amount.toFixed(2))} of your voucher for ${what}. If you agree, give them this code: ${otp}. It expires in 5 minutes.`,
    "otp",
  );
  return {
    amountLe: amount.toFixed(2),
    lines,
    remainingAfterLe: v.remainingLe.minus(amount).toFixed(2),
  };
}

/**
 * Step 3: the farmer's code confirms the redemption. Double redemption is prevented by the single-use OTP,
 * a row lock on the voucher, the remaining-value check (also a DB constraint) and the optional clientRef.
 */
export async function redeemVoucher(actor: Actor, input: RedeemVoucherInput) {
  if (!can(actor, "voucher.redeem")) throw forbidden();
  const data = redeemVoucherSchema.parse(input);
  if (data.clientRef) {
    const done = await prisma.voucherRedemption.findUnique({
      where: { clientRef: data.clientRef },
    });
    if (done) return done;
  }
  const dealer = (await dealerFor(actor, { required: true }))!;
  const v = await usableVoucher(dealer, data.code);
  const { lines, amount } = await priceItems(dealer.id, v.allowedCategories, data.items);
  await verifyOtp(v.farmer.phone, data.otp, "VOUCHER_REDEEM");

  const { redemption, payment, remaining } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InputVoucher" WHERE id = ${v.id} FOR UPDATE`;
    const fresh = await tx.inputVoucher.findUniqueOrThrow({ where: { id: v.id } });
    if (fresh.status !== "ISSUED" && fresh.status !== "PARTIALLY_REDEEMED")
      throw new AppError("CONFLICT", "This voucher can no longer be used.");
    if (amount.gt(fresh.remainingLe))
      throw new AppError(
        "CONFLICT",
        `Only ${formatLe(fresh.remainingLe.toFixed(2))} is left on this voucher.`,
      );
    const left = fresh.remainingLe.minus(amount);
    const r = await tx.voucherRedemption.create({
      data: {
        ref: `RDM-${String(await nextSequenceValue(tx, "redemption")).padStart(6, "0")}`,
        voucherId: v.id,
        dealerId: dealer.id,
        items: lines as unknown as Prisma.InputJsonValue,
        amountLe: amount,
        farmerOtpVerified: true,
        clientRef: data.clientRef ?? null,
        redeemedById: actor.userId,
      },
    });
    await tx.inputVoucher.update({
      where: { id: v.id },
      data: {
        remainingLe: left,
        status: left.lte(0) ? "REDEEMED" : "PARTIALLY_REDEEMED",
        ...(left.lte(0) ? { closedAt: new Date() } : {}),
      },
    });
    if (fresh.loanId) {
      // The farmer owes what was actually spent plus its share of the fee.
      await tx.$queryRaw`SELECT id FROM "Loan" WHERE id = ${fresh.loanId} FOR UPDATE`;
      const loan = await tx.loan.findUniqueOrThrow({
        where: { id: fresh.loanId },
        include: { product: { select: { flatFeePct: true } } },
      });
      const owed = loanCost(
        fresh.valueLe.minus(left).toFixed(2),
        loan.product.flatFeePct.toString(),
      );
      const repaidAll = left.lte(0) && loan.repaidLe.gte(owed.totalLe);
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          feeLe: owed.feeLe,
          totalDueLe: owed.totalLe,
          ...(repaidAll
            ? { status: "REPAID", repaidAt: new Date() }
            : loan.status === "REPAID"
              ? { status: "REPAYING", repaidAt: null }
              : {}),
        },
      });
      if (loan.splitRuleId)
        await tx.splitRule.update({
          where: { id: loan.splitRuleId },
          data: { active: !repaidAll },
        });
    }
    // Same-day settlement: the lender pays the dealer directly (module 04).
    const pay = await createDirectPayment(tx, {
      type: "VOUCHER_SETTLEMENT",
      payerOrgId: v.funderOrgId,
      farmerId: v.farmerId,
      amountLe: amount.toFixed(2),
      idempotencyKey: `redemption:${r.id}`,
      split: { type: "DEALER_SETTLEMENT", targetType: "DEALER", targetId: dealer.id },
      narration: `AgriPay voucher ${r.ref}`,
      context: { redemptionId: r.id, loanId: v.loanId },
      approvedById: actor.userId,
    });
    await tx.voucherRedemption.update({
      where: { id: r.id },
      data: { settlementPaymentId: pay.id },
    });
    await audit(tx, {
      actor,
      action: "voucher.redeemed",
      entity: "InputVoucher",
      entityId: v.id,
      after: {
        redemption: r.ref,
        amountLe: amount.toFixed(2),
        items: lines.length,
        otpVerified: true,
      },
    });
    return { redemption: r, payment: pay, remaining: left };
  });
  await dispatchPayments([payment.id]);
  await sendSms(
    v.farmer.phone,
    `AgriPay: you used ${formatLe(amount.toFixed(2))} of your input voucher at ${dealer.org.name}. Left on voucher: ${formatLe(remaining.toFixed(2))}. Ref ${redemption.ref}`,
    "general",
  );
  await emit("voucher.redeemed", { redemptionId: redemption.id });
  return redemption;
}

/** Module 05: what the farmer received becomes a system-verified input record. */
export async function recordInputsFromRedemption(redemptionId: string) {
  const r = await prisma.voucherRedemption.findUnique({
    where: { id: redemptionId },
    include: { voucher: true, dealer: { include: { org: true } } },
  });
  if (!r) return;
  const { seasonFor } = await import("../records/service");
  const items = r.items as { name: string; qty: number }[];
  await prisma.farmRecord.upsert({
    where: { sourceRef: `redemption:${r.id}` },
    update: {},
    create: {
      farmerId: r.voucher.farmerId,
      type: "INPUT_PURCHASE",
      season: seasonFor(r.createdAt),
      description: `${r.ref} · voucher at ${r.dealer.org.name}: ${items.map((i) => `${i.name} x${i.qty}`).join(", ")}`,
      amountLe: r.amountLe,
      occurredAt: r.createdAt,
      source: "AUTO_VOUCHER",
      verification: "SYSTEM_VERIFIED",
      sourceRef: `redemption:${r.id}`,
      createdById: r.redeemedById,
    },
  });
}

/**
 * Daily: expire vouchers. Unused value is never owed — the loan is reduced to what was actually
 * redeemed plus its proportional fee (or cancelled if nothing was used).
 */
export async function expireVouchers(now = new Date()) {
  const due = await prisma.inputVoucher.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_REDEEMED"] }, expiresAt: { lte: now } },
    include: { loan: true, farmer: true },
  });
  for (const v of due) {
    await prisma.$transaction(async (tx) => {
      await tx.inputVoucher.update({
        where: { id: v.id },
        data: { status: "EXPIRED", closedAt: now },
      });
      const l = v.loan;
      if (l) {
        const used = v.valueLe.minus(v.remainingLe);
        if (used.lte(0)) {
          // Never used: nothing is owed.
          await tx.loan.update({
            where: { id: l.id },
            data: { status: "CANCELLED", cancelledAt: now, totalDueLe: 0, feeLe: 0 },
          });
          if (l.splitRuleId)
            await tx.splitRule.update({ where: { id: l.splitRuleId }, data: { active: false } });
        } else if (l.totalDueLe && l.repaidLe.gte(l.totalDueLe)) {
          // Already repaid what was used: close it.
          await tx.loan.update({ where: { id: l.id }, data: { status: "REPAID", repaidAt: now } });
          if (l.splitRuleId)
            await tx.splitRule.update({ where: { id: l.splitRuleId }, data: { active: false } });
        }
      }
      await audit(tx, {
        actor: null,
        action: "voucher.expired",
        entity: "InputVoucher",
        entityId: v.id,
        after: { unusedLe: v.remainingLe.toFixed(2) },
      });
    });
    if (v.remainingLe.gt(0)) {
      await sendSms(
        v.farmer.phone,
        `AgriPay: your input voucher ${formatVoucherCode(v.code)} expired. The unused ${formatLe(v.remainingLe.toFixed(2))} is not charged to you.`,
        "general",
      );
    }
  }
  return { expired: due.length };
}

export async function getVoucherForFarmer(actor: Actor, voucherId: string) {
  const v = await prisma.inputVoucher.findUnique({ where: { id: voucherId } });
  if (!v || actor.farmerId !== v.farmerId) throw notFound("Voucher");
  return v;
}
