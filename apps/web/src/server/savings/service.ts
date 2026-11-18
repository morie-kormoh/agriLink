import "server-only";
import { type Db, Prisma, nextSequenceValue, prisma } from "@agripay/db";
import { earlyWithdrawalFee, nextReleaseDate } from "@agripay/finance";
import {
  currentSeason,
  earlyWithdrawalSchema,
  formatLe,
  openGoalSchema,
  openHarvestLockSchema,
  savingsProductSchema,
  updateAutoSaveSchema,
  type SavingsProductInput,
} from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { emit } from "../events";
import { confirmFarmerPin, lenderOrgId, scopedFarmer } from "../finance/common";
import { accountCodes, balanceOf } from "../payments/ledger";
import { createDirectPayment, dispatchPayments } from "../payments/service";
import { sendSms } from "../sms";

/** Savings deductions run after loan repayment (priority 1) and before co-op dues (90). */
export const SAVINGS_PRIORITY = 20;
const DAY = 86_400_000;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// ---------------------------------------------------------------------------
// Products (custodian)
// ---------------------------------------------------------------------------

export async function listSavingsProducts(actor: Actor, opts: { mine?: boolean } = {}) {
  const where: Prisma.SavingsProductWhereInput = opts.mine
    ? { custodianOrgId: lenderOrgId(actor) }
    : { active: true };
  return prisma.savingsProduct.findMany({
    where,
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: { custodian: { select: { name: true } }, _count: { select: { accounts: true } } },
  });
}

export async function createSavingsProduct(actor: Actor, input: SavingsProductInput) {
  if (!can(actor, "savingsProduct.manage")) throw forbidden();
  const data = savingsProductSchema.parse(input);
  const custodianOrgId = lenderOrgId(actor);
  return prisma.$transaction(async (tx) => {
    const product = await tx.savingsProduct.create({ data: { ...data, custodianOrgId } });
    await audit(tx, {
      actor,
      action: "savings.product_created",
      entity: "SavingsProduct",
      entityId: product.id,
      after: data,
    });
    return product;
  });
}

export async function setSavingsProductActive(actor: Actor, id: string, active: boolean) {
  if (!can(actor, "savingsProduct.manage")) throw forbidden();
  const p = await prisma.savingsProduct.findFirst({
    where: { id, custodianOrgId: lenderOrgId(actor) },
  });
  if (!p) throw notFound("Savings product");
  return prisma.$transaction(async (tx) => {
    await audit(tx, {
      actor,
      action: active ? "savings.product_activated" : "savings.product_deactivated",
      entity: "SavingsProduct",
      entityId: id,
    });
    return tx.savingsProduct.update({ where: { id }, data: { active } });
  });
}

// ---------------------------------------------------------------------------
// Opening & configuring (always confirmed with the farmer's PIN)
// ---------------------------------------------------------------------------

function channelOf(actor: Actor) {
  return actor.role === "FARMER" ? "APP" : "AGENT_ASSISTED";
}

export async function openHarvestLock(
  actor: Actor,
  farmerId: string,
  input: z.input<typeof openHarvestLockSchema>,
) {
  const data = openHarvestLockSchema.parse(input);
  return openAccount(actor, farmerId, {
    productId: data.productId,
    pct: data.pct,
    pin: data.pin,
    expectType: "HARVEST_LOCK",
  });
}

export async function openGoalSavings(
  actor: Actor,
  farmerId: string,
  input: z.input<typeof openGoalSchema>,
) {
  const data = openGoalSchema.parse(input);
  return openAccount(actor, farmerId, {
    productId: data.productId,
    pct: data.pct,
    pin: data.pin,
    expectType: "GOAL",
    goalLabel: data.goalLabel,
    goalLe: data.goalLe,
  });
}

async function openAccount(
  actor: Actor,
  farmerId: string,
  o: {
    productId: string;
    pct: number;
    pin: string;
    expectType: "HARVEST_LOCK" | "GOAL";
    goalLabel?: string;
    goalLe?: string;
  },
) {
  if (!can(actor, "savings.configure")) throw forbidden();
  const farmer = await scopedFarmer(prisma, actor, farmerId);
  const product = await prisma.savingsProduct.findUnique({ where: { id: o.productId } });
  if (!product || !product.active || product.type !== o.expectType)
    throw notFound("Savings product");
  const min = Number(product.minPct ?? 1);
  const max = Number(product.maxPct ?? 50);
  if (o.pct < min || o.pct > max)
    throw new AppError("VALIDATION", `Choose between ${min}% and ${max}%.`);
  const existing = await prisma.savingsAccount.findUnique({
    where: { farmerId_productId: { farmerId, productId: product.id } },
  });
  if (existing && existing.status === "ACTIVE")
    throw new AppError("CONFLICT", "This savings account is already open.");

  // No savings rule without the farmer's PIN — not even when an agent is helping.
  await confirmFarmerPin(farmerId, o.pin);

  const lockedUntil = product.releaseMonthDay
    ? nextReleaseDate(product.releaseMonthDay, new Date())
    : null;
  const account = await prisma.$transaction(async (tx) => {
    const ref =
      existing?.ref ?? `SAV-${String(await nextSequenceValue(tx, "savings")).padStart(6, "0")}`;
    const acc = existing
      ? await tx.savingsAccount.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            autoSavePct: o.pct,
            autoSavePaused: false,
            goalLabel: o.goalLabel ?? null,
            goalLe: o.goalLe ?? null,
            lockedUntil,
            openedVia: channelOf(actor),
          },
        })
      : await tx.savingsAccount.create({
          data: {
            ref,
            farmerId,
            productId: product.id,
            autoSavePct: o.pct,
            goalLabel: o.goalLabel ?? null,
            goalLe: o.goalLe ?? null,
            lockedUntil,
            openedVia: channelOf(actor),
          },
        });
    const rule = await tx.splitRule.create({
      data: {
        farmerId,
        type: "SAVINGS",
        priority: SAVINGS_PRIORITY,
        mode: "PERCENT",
        value: new Prisma.Decimal(o.pct),
        ofGross: false,
        targetType: "SAVINGS_ACCOUNT",
        targetId: acc.id,
        consentRef: `PIN:${channelOf(actor)}:${new Date().toISOString()}`,
      },
    });
    if (existing?.splitRuleId)
      await tx.splitRule.update({ where: { id: existing.splitRuleId }, data: { active: false } });
    await tx.savingsAccount.update({ where: { id: acc.id }, data: { splitRuleId: rule.id } });
    await audit(tx, {
      actor,
      action: "savings.opened",
      entity: "SavingsAccount",
      entityId: acc.id,
      after: {
        ref,
        product: product.name,
        pct: o.pct,
        goalLe: o.goalLe,
        channel: channelOf(actor),
        pinConfirmed: true,
      },
    });
    return acc;
  });
  await sendSms(
    farmer.phone,
    product.type === "HARVEST_LOCK"
      ? `AgriPay: Harvest Lock opened. ${o.pct}% of each sale will be saved with ${product.name}${lockedUntil ? ` and unlocks ${fmtDate(lockedUntil)} for planting` : ""}. Ref ${account.ref}`
      : `AgriPay: Savings goal "${o.goalLabel}" (${formatLe(o.goalLe!)}) opened. ${o.pct}% of each sale will be saved. Ref ${account.ref}`,
    "general",
  );
  return account;
}

async function accountForActor(db: Db, actor: Actor, accountId: string) {
  const acc = await db.savingsAccount.findUnique({
    where: { id: accountId },
    include: { product: { include: { custodian: { select: { name: true } } } } },
  });
  if (!acc?.farmerId) throw notFound("Savings account");
  await scopedFarmer(db, actor, acc.farmerId);
  return acc;
}

/** Change the % or pause / resume auto-save. Takes effect on the next payment. */
export async function updateAutoSave(
  actor: Actor,
  accountId: string,
  input: z.input<typeof updateAutoSaveSchema>,
) {
  if (!can(actor, "savings.configure")) throw forbidden();
  const data = updateAutoSaveSchema.parse(input);
  const acc = await accountForActor(prisma, actor, accountId);
  if (acc.status !== "ACTIVE" || !acc.splitRuleId)
    throw new AppError("CONFLICT", "This account is not active.");
  if (data.pct != null) {
    const min = Number(acc.product.minPct ?? 1);
    const max = Number(acc.product.maxPct ?? 50);
    if (data.pct < min || data.pct > max)
      throw new AppError("VALIDATION", `Choose between ${min}% and ${max}%.`);
  }
  await confirmFarmerPin(acc.farmerId!, data.pin);
  const goalDone = acc.goalLe != null && acc.balanceLe.gte(acc.goalLe);
  const paused = data.paused ?? acc.autoSavePaused;
  return prisma.$transaction(async (tx) => {
    await tx.splitRule.update({
      where: { id: acc.splitRuleId! },
      data: {
        ...(data.pct != null ? { value: new Prisma.Decimal(data.pct) } : {}),
        active: !paused && !goalDone,
      },
    });
    const updated = await tx.savingsAccount.update({
      where: { id: acc.id },
      data: { ...(data.pct != null ? { autoSavePct: data.pct } : {}), autoSavePaused: paused },
    });
    await audit(tx, {
      actor,
      action: "savings.autosave_updated",
      entity: "SavingsAccount",
      entityId: acc.id,
      before: { pct: acc.autoSavePct, paused: acc.autoSavePaused },
      after: { pct: data.pct ?? acc.autoSavePct, paused, pinConfirmed: true },
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Withdrawals & releases
// ---------------------------------------------------------------------------

async function pendingReleases(db: Db, accountId: string) {
  const pending = await db.payment.findMany({
    where: {
      type: "SAVINGS_RELEASE",
      status: { in: ["PENDING", "PROCESSING"] },
      context: { path: ["savingsAccountId"], equals: accountId },
    },
    select: { grossLe: true, context: true },
  });
  return pending.reduce(
    (s, p) =>
      s.plus(p.grossLe).plus(String((p.context as { feeLe?: string } | null)?.feeLe ?? "0")),
    new Prisma.Decimal(0),
  );
}

/** Balance the farmer can still withdraw (excludes releases already on their way). */
export async function availableBalance(db: Db, acc: { id: string; balanceLe: Prisma.Decimal }) {
  return Prisma.Decimal.max(acc.balanceLe.minus(await pendingReleases(db, acc.id)), 0);
}

async function primaryWallet(db: Db, farmerId: string) {
  return db.wallet.findFirst({ where: { farmerId, isPrimary: true } });
}

export async function previewEarlyWithdrawal(actor: Actor, accountId: string, amountLe: string) {
  const acc = await accountForActor(prisma, actor, accountId);
  return {
    ...earlyWithdrawalFee(amountLe, acc.product.earlyWithdrawalFeePct),
    allowed: acc.product.earlyWithdrawalAllowed,
    usedThisSeason: acc.earlyWithdrawalSeason === currentSeason(),
  };
}

/** Emergency withdrawal: once per season, fee disclosed first, confirmed with PIN. */
export async function requestEarlyWithdrawal(
  actor: Actor,
  accountId: string,
  input: z.input<typeof earlyWithdrawalSchema>,
) {
  if (!can(actor, "savings.configure")) throw forbidden();
  const data = earlyWithdrawalSchema.parse(input);
  const acc = await accountForActor(prisma, actor, accountId);
  if (!acc.product.earlyWithdrawalAllowed)
    throw new AppError("CONFLICT", "This savings product does not allow early withdrawals.");
  const season = currentSeason();
  if (acc.earlyWithdrawalSeason === season)
    throw new AppError(
      "CONFLICT",
      "You can make one early withdrawal per season.",
      "savings.errors.oncePerSeason",
    );
  const quote = earlyWithdrawalFee(data.amountLe, acc.product.earlyWithdrawalFeePct);
  const available = await availableBalance(prisma, acc);
  if (new Prisma.Decimal(quote.amountLe).gt(available))
    throw new AppError("VALIDATION", `You can withdraw up to ${formatLe(available.toFixed(2))}.`);
  if (new Prisma.Decimal(quote.netLe).lte(0))
    throw new AppError("VALIDATION", "Amount is too small after the fee.");
  const wallet = await primaryWallet(prisma, acc.farmerId!);
  if (!wallet) throw new AppError("VALIDATION", "Add a mobile money wallet first.");
  await confirmFarmerPin(acc.farmerId!, data.pin);

  const payment = await prisma.$transaction(async (tx) => {
    // Claim the once-per-season slot atomically (two quick taps must not create two withdrawals).
    const claimed = await tx.savingsAccount.updateMany({
      where: {
        id: acc.id,
        OR: [{ earlyWithdrawalSeason: null }, { earlyWithdrawalSeason: { not: season } }],
      },
      data: { earlyWithdrawalSeason: season },
    });
    if (claimed.count !== 1)
      throw new AppError(
        "CONFLICT",
        "You can make one early withdrawal per season.",
        "savings.errors.oncePerSeason",
      );
    const pay = await createDirectPayment(tx, {
      type: "SAVINGS_RELEASE",
      payerOrgId: acc.product.custodianOrgId,
      farmerId: acc.farmerId,
      amountLe: quote.netLe,
      idempotencyKey: `savings-early:${acc.id}:${season}`,
      split: { type: "FARMER_WALLET", targetType: "WALLET", targetId: wallet.id },
      narration: `AgriPay ${acc.ref} early withdrawal`,
      sourceAccountCode: accountCodes.savings(acc.id),
      fromAccount: acc.custodianAccountRef,
      context: { savingsAccountId: acc.id, feeLe: quote.feeLe, early: true },
      approvedById: actor.userId,
      explanation: `Early withdrawal ${formatLe(quote.amountLe)} − fee ${formatLe(quote.feeLe)}`,
    });
    await audit(tx, {
      actor,
      action: "savings.early_withdrawal",
      entity: "SavingsAccount",
      entityId: acc.id,
      after: { ...quote, payment: pay.ref, pinConfirmed: true },
    });
    return pay;
  });
  await dispatchPayments([payment.id]);
  return { payment, ...quote };
}

/**
 * Daily job: 7-day notices, then release every due Harvest Lock (and reached goals) to the farmer's wallet.
 * Idempotent per account and release date.
 */
export async function runScheduledReleases(now = new Date()) {
  // 1. Notices 7 days before release.
  const soon = await prisma.savingsAccount.findMany({
    where: {
      status: "ACTIVE",
      lockedUntil: { gt: now, lte: new Date(now.getTime() + 7 * DAY) },
      balanceLe: { gt: 0 },
      farmerId: { not: null },
    },
    include: { farmer: true },
  });
  let notices = 0;
  for (const a of soon) {
    if (a.releaseNoticeFor?.getTime() === a.lockedUntil!.getTime()) continue;
    const marked = await prisma.savingsAccount.updateMany({
      where: {
        id: a.id,
        OR: [{ releaseNoticeFor: null }, { releaseNoticeFor: { not: a.lockedUntil } }],
      },
      data: { releaseNoticeFor: a.lockedUntil },
    });
    if (marked.count !== 1) continue;
    notices++;
    await sendSms(
      a.farmer!.phone,
      `AgriPay: your savings of ${formatLe(a.balanceLe.toFixed(2))} (${a.ref}) will be paid to your mobile money on ${fmtDate(a.lockedUntil!)} for planting.`,
      "general",
    );
  }

  // 2. Releases.
  const due = await prisma.savingsAccount.findMany({
    where: {
      status: "ACTIVE",
      farmerId: { not: null },
      OR: [
        { lockedUntil: { lte: now } },
        { product: { releaseRule: "GOAL_REACHED" }, goalLe: { not: null } },
      ],
    },
    include: { product: true },
  });
  const paymentIds: string[] = [];
  let skipped = 0;
  for (const a of due) {
    const goalRelease = a.product.releaseRule === "GOAL_REACHED";
    if (goalRelease && (!a.goalLe || a.balanceLe.lt(a.goalLe))) continue;
    const available = await availableBalance(prisma, a);
    if (available.lte(0)) {
      if (!goalRelease && a.product.releaseMonthDay && a.balanceLe.lte(0)) {
        await prisma.savingsAccount.update({
          where: { id: a.id },
          data: { lockedUntil: nextReleaseDate(a.product.releaseMonthDay, now) },
        });
      }
      continue;
    }
    const wallet = await primaryWallet(prisma, a.farmerId!);
    if (!wallet) {
      skipped++;
      continue;
    }
    const key = goalRelease
      ? `savings-goal:${a.id}:${a.goalLe!.toFixed(2)}`
      : `savings-release:${a.id}:${a.lockedUntil!.toISOString().slice(0, 10)}`;
    const pay = await prisma.$transaction(async (tx) => {
      const p = await createDirectPayment(tx, {
        type: "SAVINGS_RELEASE",
        payerOrgId: a.product.custodianOrgId,
        farmerId: a.farmerId,
        amountLe: available.toFixed(2),
        idempotencyKey: key,
        split: { type: "FARMER_WALLET", targetType: "WALLET", targetId: wallet.id },
        narration: `AgriPay ${a.ref} savings release`,
        sourceAccountCode: accountCodes.savings(a.id),
        fromAccount: a.custodianAccountRef,
        context: { savingsAccountId: a.id, feeLe: "0", early: false },
        explanation: goalRelease ? "Savings goal reached" : "Scheduled Harvest Lock release",
      });
      await audit(tx, {
        actor: null,
        action: "savings.release_scheduled",
        entity: "SavingsAccount",
        entityId: a.id,
        after: { amountLe: available.toFixed(2), payment: p.ref },
      });
      return p;
    });
    if (pay.status === "PENDING") paymentIds.push(pay.id);
  }
  await dispatchPayments(paymentIds);
  return { notices, releases: paymentIds.length, skippedNoWallet: skipped };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getSavingsSummary(actor: Actor, farmerId: string) {
  if (!can(actor, "savings.read")) throw forbidden();
  const farmer = await scopedFarmer(prisma, actor, farmerId);
  const [accounts, products, groups] = await Promise.all([
    prisma.savingsAccount.findMany({
      where: { farmerId },
      orderBy: { createdAt: "asc" },
      include: {
        product: { include: { custodian: { select: { name: true } } } },
        transactions: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    }),
    prisma.savingsProduct.findMany({
      where: { active: true },
      include: { custodian: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.savingsGroupMember.findMany({
      where: { farmerId },
      include: {
        group: {
          select: {
            id: true,
            ref: true,
            name: true,
            type: true,
            contributionLe: true,
            frequency: true,
          },
        },
      },
    }),
  ]);
  const groupTotals = await prisma.groupContribution.groupBy({
    by: ["groupId"],
    where: { farmerId },
    _sum: { amountLe: true },
    _count: true,
  });
  const withAvail = await Promise.all(
    accounts.map(async (a) => ({
      ...a,
      availableLe: (await availableBalance(prisma, a)).toFixed(2),
    })),
  );
  return {
    farmer,
    accounts: withAvail,
    products,
    groups: groups.map((g) => ({
      ...g.group,
      role: g.role,
      payoutOrder: g.payoutOrder,
      myTotalLe: (
        groupTotals.find((t) => t.groupId === g.group.id)?._sum.amountLe ?? new Prisma.Decimal(0)
      ).toFixed(2),
      myContributions: groupTotals.find((t) => t.groupId === g.group.id)?._count ?? 0,
    })),
    totalSavedLe: accounts.reduce((s, a) => s.plus(a.balanceLe), new Prisma.Decimal(0)).toFixed(2),
  };
}

/** Custodian view: accounts held for this institution, with a ledger cross-check. */
export async function custodianAccounts(actor: Actor) {
  if (!can(actor, "savings.read")) throw forbidden();
  const orgId = lenderOrgId(actor);
  const accounts = await prisma.savingsAccount.findMany({
    where: { product: { custodianOrgId: orgId } },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      product: { select: { name: true, type: true } },
      farmer: { select: { fullName: true, agripayId: true, districtId: true } },
    },
  });
  const rows = await Promise.all(
    accounts.map(async (a) => {
      const ledger = await balanceOf(prisma, accountCodes.savings(a.id));
      return { ...a, ledgerLe: ledger.toFixed(2), mirrorOk: ledger.equals(a.balanceLe) };
    }),
  );
  return {
    rows,
    totalLe: rows.reduce((s, r) => s.plus(r.balanceLe), new Prisma.Decimal(0)).toFixed(2),
    mismatches: rows.filter((r) => !r.mirrorOk).length,
  };
}

/** Compare the custodian's statement (ref, balance) with AgriPay's mirror. */
export async function reconcileSavings(actor: Actor, rows: { ref: string; balanceLe: string }[]) {
  const { rows: ours } = await custodianAccounts(actor);
  const byRef = new Map(ours.map((o) => [o.ref, o]));
  const matched: string[] = [];
  const mismatched: { ref: string; ours: string; theirs: string }[] = [];
  const unknown: string[] = [];
  for (const r of rows) {
    const o = byRef.get(r.ref.trim());
    if (!o) unknown.push(r.ref);
    else if (o.balanceLe.equals(new Prisma.Decimal(r.balanceLe || 0))) matched.push(r.ref);
    else mismatched.push({ ref: r.ref, ours: o.balanceLe.toFixed(2), theirs: r.balanceLe });
    byRef.delete(r.ref.trim());
  }
  const missing = [...byRef.values()].filter((o) => o.balanceLe.gt(0)).map((o) => o.ref);
  await prisma.$transaction((tx) =>
    audit(tx, {
      actor,
      action: "savings.reconciled",
      entity: "Organization",
      entityId: actor.orgId!,
      after: {
        matched: matched.length,
        mismatched: mismatched.length,
        missing: missing.length,
        unknown: unknown.length,
      },
    }),
  );
  return { matched, mismatched, missing, unknown };
}

/** Notify the farmer after a savings movement (called from the split.succeeded event). */
export async function notifySavingsMovement(e: {
  accountId: string;
  amountLe: string;
  balanceLe: string;
  kind: "CREDIT" | "RELEASE" | "EARLY";
  feeLe?: string;
  goalReached?: boolean;
}) {
  const a = await prisma.savingsAccount.findUnique({
    where: { id: e.accountId },
    include: { farmer: true, product: true },
  });
  if (!a?.farmer) return;
  const name =
    a.product.type === "HARVEST_LOCK" ? "Harvest Lock" : `"${a.goalLabel ?? a.product.name}"`;
  const body =
    e.kind === "CREDIT"
      ? `AgriPay: ${formatLe(e.amountLe)} saved to ${name}. Total ${formatLe(e.balanceLe)}.${a.lockedUntil ? ` Unlocks ${fmtDate(a.lockedUntil)} for planting.` : ""}${e.goalReached ? " Goal reached — well done!" : ""}`
      : e.kind === "RELEASE"
        ? `AgriPay: ${formatLe(e.amountLe)} from your ${name} savings has been paid to your mobile money. Good luck with planting!`
        : `AgriPay: early withdrawal of ${formatLe(e.amountLe)} paid to your mobile money (fee ${formatLe(e.feeLe ?? "0")}). Savings left: ${formatLe(e.balanceLe)}.`;
  await sendSms(a.farmer.phone, body, "general");
  await emit("score.stale", { farmerId: a.farmer.id });
}
