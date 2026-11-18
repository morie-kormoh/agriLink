import "server-only";
import {
  type Db,
  type MobileMoneyProvider,
  type PaymentType,
  Prisma,
  type ProviderCode,
  type SplitType,
  type Tx,
  nextSequenceValue,
  prisma,
} from "@agripay/db";
import {
  type ProviderResult,
  ProviderNotConfiguredError,
  type WaterfallResult,
  type WaterfallRule,
  computeWaterfall,
  summariseSplits,
} from "@agripay/payments";
import { formatLe } from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { emit } from "../events";
import { queue } from "../queues";
import { sendSms } from "../sms";
import { adapterFor, providerForWallet } from "./adapters";
import { onSplitSucceeded, type SplitEffect } from "./hooks";
import { type JournalLine, accountCodes, balanceOf, postJournal } from "./ledger";

export const MAX_ATTEMPTS = 5;
/** Wait before retry n (1-based): 1m, 5m, 15m, 1h, 6h */
const BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000];
const POLL_MS = 2 * 60_000;
export const DUES_PRIORITY = 90;

export function backoffMs(attempt: number) {
  return BACKOFF_MS[Math.min(Math.max(attempt - 1, 0), BACKOFF_MS.length - 1)]!;
}

// ---------------------------------------------------------------------------
// Rules & preview
// ---------------------------------------------------------------------------

/** Active split rules for a farmer + the co-op dues rule derived from co-op settings. */
export async function farmerRules(
  db: Db,
  farmer: { id: string; cooperativeId: string | null },
  at = new Date(),
): Promise<WaterfallRule[]> {
  const rows = await db.splitRule.findMany({
    where: {
      farmerId: farmer.id,
      active: true,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    orderBy: { priority: "asc" },
  });
  const rules: WaterfallRule[] = [];
  for (const r of rows) {
    if (r.type === "FARMER_WALLET" || r.type === "DEALER_SETTLEMENT") continue;
    let outstandingLe: string | null = null;
    let maxPct: string | null = null;
    if (r.mode === "OUTSTANDING_BALANCE") {
      if (r.targetType === "LOAN") {
        const loan = await loanOutstanding(db, r.targetId);
        if (!loan || loan.outstanding.lte(0)) continue;
        outstandingLe = loan.outstanding.toFixed(2);
        maxPct = loan.maxPct;
      } else {
        outstandingLe = r.value?.toString() ?? "0";
      }
    }
    rules.push({
      id: r.id,
      type: r.type as WaterfallRule["type"],
      priority: r.priority,
      mode: r.mode,
      value: r.mode === "OUTSTANDING_BALANCE" ? null : (r.value?.toString() ?? null),
      outstandingLe,
      maxPct,
      ofGross: r.ofGross,
      capLe: r.capLe?.toString() ?? null,
      targetType: r.targetType,
      targetId: r.targetId,
    });
  }

  if (farmer.cooperativeId) {
    const coop = await db.cooperative.findUnique({ where: { orgId: farmer.cooperativeId } });
    if (coop?.duesPct && coop.duesPct.gt(0)) {
      rules.push({
        id: `dues:${coop.orgId}`,
        type: "COOP_DUES",
        priority: DUES_PRIORITY,
        mode: "PERCENT",
        value: coop.duesPct.toString(),
        ofGross: true,
        targetType: "COOPERATIVE",
        targetId: coop.orgId,
      });
    } else if (coop?.duesFlatLe && coop.duesFlatLe.gt(0)) {
      rules.push({
        id: `dues:${coop.orgId}`,
        type: "COOP_DUES",
        priority: DUES_PRIORITY,
        mode: "FIXED",
        value: coop.duesFlatLe.toString(),
        targetType: "COOPERATIVE",
        targetId: coop.orgId,
      });
    }
  }
  return rules;
}

const ACTIVE_LOAN = ["DISBURSED", "REPAYING", "LATE", "RESTRUCTURED", "DEFAULTED"];

/**
 * What is still owed on a loan, minus repayments already on their way (splits created but not yet confirmed),
 * so two payments approved close together never collect the same balance twice.
 */
export async function loanOutstanding(db: Db, loanId: string) {
  const loan = await db.loan.findUnique({
    where: { id: loanId },
    include: { product: { select: { maxRepaymentPctPerSale: true } } },
  });
  if (!loan || !ACTIVE_LOAN.includes(loan.status) || !loan.totalDueLe) return null;
  const inflight = await db.paymentSplit.aggregate({
    where: { type: "LOAN_REPAYMENT", targetId: loanId, status: { in: ["PENDING", "PROCESSING"] } },
    _sum: { amountLe: true },
  });
  const outstanding = loan.totalDueLe.minus(loan.repaidLe).minus(inflight._sum.amountLe ?? 0);
  return {
    outstanding: Prisma.Decimal.max(outstanding, 0),
    maxPct: loan.product.maxRepaymentPctPerSale.toString(),
  };
}

export async function previewWaterfall(
  actor: Actor,
  farmerId: string,
  grossLe: string,
): Promise<WaterfallResult & { walletMissing: boolean }> {
  if (
    !can(actor, "purchase.create") &&
    !can(actor, "payment.approve") &&
    !can(actor, "payment.read")
  )
    throw forbidden();
  const farmer = await prisma.farmer.findUnique({
    where: { id: farmerId },
    include: { wallets: { where: { isPrimary: true }, take: 1 } },
  });
  if (!farmer) throw notFound("Farmer");
  if (actor.role === "FARMER" && actor.farmerId !== farmer.id) throw forbidden();
  if (
    (actor.role === "COOP_ADMIN" || actor.role === "COOP_STAFF" || actor.role === "AGENT") &&
    farmer.cooperativeId !== actor.orgId
  )
    throw forbidden();
  const wallet = farmer.wallets[0];
  const result = computeWaterfall(grossLe, await farmerRules(prisma, farmer), {
    targetType: "WALLET",
    targetId: wallet?.id ?? "NONE",
  });
  return { ...result, walletMissing: !wallet };
}

// ---------------------------------------------------------------------------
// Creating payments
// ---------------------------------------------------------------------------

async function payerFunding(
  db: Db,
  orgId: string,
): Promise<{ provider: MobileMoneyProvider | null; account: string }> {
  // Sequential on purpose: `db` is often a transaction, which runs one query at a time.
  const s =
    (await db.cooperative.findUnique({ where: { orgId } })) ??
    (await db.buyer.findUnique({ where: { orgId } })) ??
    (await db.financialInstitution.findUnique({ where: { orgId } }));
  return { provider: s?.fundingProvider ?? null, account: s?.fundingAccount ?? `FUND-${orgId}` };
}

async function destinationFor(
  db: Db,
  type: SplitType,
  targetId: string,
): Promise<{ account: string; provider: MobileMoneyProvider | null }> {
  switch (type) {
    case "FARMER_WALLET": {
      const w = await db.wallet.findUniqueOrThrow({ where: { id: targetId } });
      return { account: w.msisdn, provider: w.provider };
    }
    case "COOP_DUES": {
      const c = await db.cooperative.findUnique({ where: { orgId: targetId } });
      return {
        account: c?.fundingAccount ?? `DUES-${targetId}`,
        provider: c?.fundingProvider ?? null,
      };
    }
    case "SAVINGS": {
      // Savings are held by the licensed custodian: the farmer's sub-account, else the pooled custodial account.
      const a = await db.savingsAccount.findUnique({
        where: { id: targetId },
        include: {
          product: { include: { custodian: { include: { financialInstitution: true } } } },
        },
      });
      const fi = a?.product.custodian.financialInstitution;
      return {
        account: a?.custodianAccountRef ?? fi?.savingsAccount ?? `SAVINGS-${a?.ref ?? targetId}`,
        provider: fi?.fundingProvider ?? null,
      };
    }
    case "LOAN_REPAYMENT": {
      const loan = await db.loan.findUnique({
        where: { id: targetId },
        include: { lenderOrg: { include: { financialInstitution: true } } },
      });
      const fi = loan?.lenderOrg.financialInstitution;
      return {
        account: fi?.collectionAccount ?? fi?.fundingAccount ?? `LOAN-${loan?.ref ?? targetId}`,
        provider: fi?.fundingProvider ?? null,
      };
    }
    case "DEALER_SETTLEMENT": {
      const d = await db.agroDealer.findUniqueOrThrow({ where: { id: targetId } });
      return { account: d.payoutMsisdn, provider: d.payoutProvider };
    }
    default:
      // Insurance accounts live at partner institutions (module 12).
      return { account: `${type}-${targetId}`, provider: null };
  }
}

/**
 * Create the payment for an approved purchase (idempotent on the purchase).
 * Each split becomes one provider instruction straight from the payer to its destination — AgriPay never pools funds.
 */
export async function createPaymentForPurchase(tx: Tx, purchaseId: string, approvedById: string) {
  const idempotencyKey = `purchase:${purchaseId}`;
  const existing = await tx.payment.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const purchase = await tx.purchase.findUniqueOrThrow({
    where: { id: purchaseId },
    include: {
      farmer: { include: { wallets: { where: { isPrimary: true }, take: 1 } } },
      crop: true,
    },
  });
  const wallet = purchase.farmer.wallets[0];
  if (!wallet)
    throw new AppError(
      "VALIDATION",
      `${purchase.farmer.fullName} has no mobile money wallet. Add one before paying.`,
    );

  const wf = computeWaterfall(purchase.netLe.toString(), await farmerRules(tx, purchase.farmer), {
    targetType: "WALLET",
    targetId: wallet.id,
  });
  const payer = await payerFunding(tx, purchase.buyerOrgId);
  const ref = `PAY-${String(await nextSequenceValue(tx, "payment")).padStart(6, "0")}`;
  const narration = `AgriPay ${purchase.ref} ${purchase.crop.name}`;

  const splitsData = [];
  for (const s of wf.splits) {
    const dest = await destinationFor(tx, s.type, s.targetId);
    const amount = new Prisma.Decimal(s.amountLe);
    splitsData.push({
      order: s.order,
      type: s.type,
      amountLe: amount,
      targetType: s.targetType,
      targetId: s.targetId,
      status: amount.gt(0) ? ("PENDING" as const) : ("SUCCESS" as const),
      instructions: amount.gt(0)
        ? {
            create: [
              {
                provider: providerForWallet(dest.provider ?? payer.provider),
                fromAccount: payer.account,
                toAccount: dest.account,
                amountLe: amount,
                narration,
                idempotencyKey: `${idempotencyKey}:split:${s.order}`,
              },
            ],
          }
        : undefined,
    });
  }

  const payment = await tx.payment.create({
    data: {
      ref,
      type: "BUYER_TO_FARMER",
      purchaseId,
      payerOrgId: purchase.buyerOrgId,
      farmerId: purchase.farmerId,
      grossLe: purchase.netLe,
      idempotencyKey,
      approvedById,
      explanation: wf as unknown as Prisma.InputJsonValue,
      splits: { create: splitsData },
    },
  });
  await tx.purchase.update({ where: { id: purchaseId }, data: { status: "PAYMENT_PENDING" } });
  await audit(tx, {
    actor: { userId: approvedById, role: "COOP_ADMIN", orgId: purchase.buyerOrgId },
    action: "payment.created",
    entity: "Payment",
    entityId: payment.id,
    after: {
      ref,
      purchase: purchase.ref,
      grossLe: purchase.netLe,
      splits: wf.splits.map((s) => ({ type: s.type, amountLe: s.amountLe })),
    },
  });
  return payment;
}

/**
 * A single transfer that is not a purchase: savings release / early withdrawal (custodian → farmer),
 * voucher settlement (lender → agro-dealer). Idempotent on `idempotencyKey`.
 */
export async function createDirectPayment(
  tx: Tx,
  p: {
    type: PaymentType;
    payerOrgId: string;
    farmerId?: string | null;
    amountLe: string;
    idempotencyKey: string;
    split: { type: SplitType; targetType: string; targetId: string };
    narration: string;
    /** Ledger account to debit instead of the payer's funding account */
    sourceAccountCode?: string | null;
    /** Pay from this account instead of the payer's funding account */
    fromAccount?: string | null;
    context?: Record<string, unknown>;
    approvedById?: string | null;
    explanation?: string;
  },
) {
  const existing = await tx.payment.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
  if (existing) return existing;
  const amount = new Prisma.Decimal(p.amountLe);
  if (amount.lte(0)) throw new AppError("VALIDATION", "Amount must be more than 0.");
  const payer = await payerFunding(tx, p.payerOrgId);
  const dest = await destinationFor(tx, p.split.type, p.split.targetId);
  const ref = `PAY-${String(await nextSequenceValue(tx, "payment")).padStart(6, "0")}`;
  return tx.payment.create({
    data: {
      ref,
      type: p.type,
      payerOrgId: p.payerOrgId,
      farmerId: p.farmerId ?? null,
      grossLe: amount,
      idempotencyKey: p.idempotencyKey,
      approvedById: p.approvedById ?? null,
      sourceAccountCode: p.sourceAccountCode ?? null,
      context: (p.context ?? {}) as Prisma.InputJsonValue,
      explanation: {
        grossLe: amount.toFixed(2),
        splits: [
          {
            order: 1,
            type: p.split.type,
            amountLe: amount.toFixed(2),
            targetType: p.split.targetType,
            targetId: p.split.targetId,
            ruleId: null,
            explanation: p.explanation ?? p.narration,
          },
        ],
        farmerLe: p.split.type === "FARMER_WALLET" ? amount.toFixed(2) : "0.00",
        deductedLe: "0.00",
        floorApplied: false,
      } as Prisma.InputJsonValue,
      splits: {
        create: [
          {
            order: 1,
            type: p.split.type,
            amountLe: amount,
            targetType: p.split.targetType,
            targetId: p.split.targetId,
            instructions: {
              create: [
                {
                  provider: providerForWallet(dest.provider ?? payer.provider),
                  fromAccount: p.fromAccount ?? payer.account,
                  toAccount: dest.account,
                  amountLe: amount,
                  narration: p.narration,
                  idempotencyKey: `${p.idempotencyKey}:split:1`,
                },
              ],
            },
          },
        ],
      },
    },
  });
}

/** Execute now (default) or hand to the worker (PAYMENT_EXECUTION=queue). */
export async function dispatchPayments(paymentIds: string[]) {
  if (!paymentIds.length) return;
  if (process.env.PAYMENT_EXECUTION === "queue") {
    await Promise.all(
      paymentIds.map((id) =>
        queue("payments").add("execute", { paymentId: id }, { jobId: `execute:${id}` }),
      ),
    );
    return;
  }
  for (const id of paymentIds) {
    try {
      await executePayment(id);
    } catch (e) {
      console.error("[payments] execute failed", id, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export async function executePayment(paymentId: string, opts: { force?: boolean } = {}) {
  const due = await prisma.providerInstruction.findMany({
    where: {
      split: { paymentId },
      status: "PENDING",
      ...(opts.force ? {} : { nextAttemptAt: { lte: new Date() } }),
    },
    orderBy: { split: { order: "asc" } },
  });
  for (const inst of due) await runInstruction(inst.id);
  return maybeCompletePayment(paymentId);
}

async function runInstruction(instructionId: string) {
  // Claim atomically so two workers never send the same instruction at once.
  const claimed = await prisma.providerInstruction.updateMany({
    where: { id: instructionId, status: "PENDING" },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      nextAttemptAt: new Date(Date.now() + POLL_MS),
    },
  });
  if (claimed.count !== 1) return;
  const inst = await prisma.providerInstruction.findUniqueOrThrow({ where: { id: instructionId } });

  let result: ProviderResult | null = null;
  try {
    const adapter = adapterFor(inst.provider);
    // Never re-send without asking the provider first (avoids double payment).
    if (inst.attempts > 1 || inst.providerRef) {
      const status = await adapter.getStatus({
        providerRef: inst.providerRef,
        idempotencyKey: inst.idempotencyKey,
      });
      if (status && (status.status === "SUCCESS" || status.status === "PENDING")) result = status;
    }
    if (!result) {
      const request = {
        idempotencyKey: inst.idempotencyKey,
        from: inst.fromAccount,
        to: inst.toAccount,
        amountLe: inst.amountLe.toFixed(2),
        narration: inst.narration,
      };
      await prisma.providerInstruction.update({
        where: { id: inst.id },
        data: { requestPayload: request },
      });
      result = await adapter.disburse(request);
    }
  } catch (e) {
    result = {
      status: "FAILED",
      errorCode:
        e instanceof ProviderNotConfiguredError ? "PROVIDER_NOT_CONFIGURED" : "ADAPTER_ERROR",
      error: (e as Error).message,
      retryable: !(e instanceof ProviderNotConfiguredError),
    };
  }
  await applyResult(inst.id, result);
}

const FINAL = new Set(["SUCCESS", "FAILED", "CANCELLED"]);

/** Apply a provider result to an instruction (from a send, a status poll or a callback). Idempotent. */
export async function applyResult(instructionId: string, result: ProviderResult) {
  const effect = await prisma.$transaction(async (tx): Promise<SplitEffect | null> => {
    // Lock the row so a callback and a poll can't both post the same transfer.
    await tx.$queryRaw`SELECT id FROM "ProviderInstruction" WHERE id = ${instructionId} FOR UPDATE`;
    const inst = await tx.providerInstruction.findUniqueOrThrow({
      where: { id: instructionId },
      include: { split: { include: { payment: true } } },
    });
    if (FINAL.has(inst.status)) return null;

    const raw = (result.raw ?? result) as Prisma.InputJsonValue;
    if (result.status === "SUCCESS") {
      await tx.providerInstruction.update({
        where: { id: inst.id },
        data: {
          status: "SUCCESS",
          providerRef: result.providerRef ?? inst.providerRef,
          responsePayload: raw,
          lastError: null,
        },
      });
      await tx.paymentSplit.update({ where: { id: inst.splitId }, data: { status: "SUCCESS" } });
      await postJournal(
        tx,
        await journalFor(
          tx,
          inst.split.payment,
          inst.split,
          inst.amountLe.toFixed(2),
          inst.providerRef ?? result.providerRef,
        ),
        inst.split.paymentId,
      );
      // Savings credits, loan repayments, releases and dealer settlements update in the same transaction as the ledger.
      return onSplitSucceeded(tx, inst.split.payment, inst.split);
    } else if (result.status === "PENDING") {
      await tx.providerInstruction.update({
        where: { id: inst.id },
        data: {
          status: "PROCESSING",
          providerRef: result.providerRef ?? inst.providerRef,
          responsePayload: raw,
          nextAttemptAt: new Date(Date.now() + POLL_MS),
        },
      });
      await tx.paymentSplit.update({ where: { id: inst.splitId }, data: { status: "PROCESSING" } });
    } else {
      const retry = result.retryable !== false && inst.attempts < MAX_ATTEMPTS;
      await tx.providerInstruction.update({
        where: { id: inst.id },
        data: {
          status: retry ? "PENDING" : "FAILED",
          retryable: retry,
          providerRef: result.providerRef ?? inst.providerRef,
          lastError: `${result.errorCode ?? "FAILED"}: ${result.error ?? ""}`.trim(),
          responsePayload: raw,
          nextAttemptAt: new Date(Date.now() + backoffMs(inst.attempts)),
        },
      });
      await tx.paymentSplit.update({
        where: { id: inst.splitId },
        data: { status: retry ? "PENDING" : "FAILED" },
      });
    }
    return null;
  });
  if (effect) await emit("split.succeeded", effect);
}

async function journalFor(
  tx: Tx,
  payment: { payerOrgId: string | null; ref: string; sourceAccountCode: string | null },
  split: { type: SplitType; targetId: string },
  amountLe: string,
  providerRef?: string | null,
): Promise<JournalLine[]> {
  const memo = `${payment.ref}${providerRef ? ` · ${providerRef}` : ""}`;
  const payerId = payment.payerOrgId ?? "platform";
  const debit: JournalLine = payment.sourceAccountCode
    ? {
        accountCode: payment.sourceAccountCode,
        ownerType: payment.sourceAccountCode.split(":")[0]!,
        ownerId: payment.sourceAccountCode.split(":")[1] ?? payerId,
        name: "Source account",
        debitLe: amountLe,
        memo,
      }
    : {
        accountCode: accountCodes.funding(payerId),
        ownerType: "ORG",
        ownerId: payerId,
        name: "Payer funding",
        debitLe: amountLe,
        memo,
      };
  let credit: JournalLine;
  switch (split.type) {
    case "FARMER_WALLET": {
      const w = await tx.wallet.findUniqueOrThrow({
        where: { id: split.targetId },
        include: { farmer: true },
      });
      credit = {
        accountCode: accountCodes.farmerWallet(w.farmer.agripayId),
        ownerType: "FARMER",
        ownerId: w.farmerId,
        name: `${w.farmer.fullName} wallet`,
        creditLe: amountLe,
        memo,
      };
      break;
    }
    case "COOP_DUES":
      credit = {
        accountCode: accountCodes.coopDues(split.targetId),
        ownerType: "ORG",
        ownerId: split.targetId,
        name: "Co-op dues",
        creditLe: amountLe,
        memo,
      };
      break;
    case "SAVINGS":
      credit = {
        accountCode: accountCodes.savings(split.targetId),
        ownerType: "SAVINGS",
        ownerId: split.targetId,
        name: "Savings",
        creditLe: amountLe,
        memo,
      };
      break;
    case "LOAN_REPAYMENT":
      credit = {
        accountCode: accountCodes.loan(split.targetId),
        ownerType: "LOAN",
        ownerId: split.targetId,
        name: "Loan repayments",
        creditLe: amountLe,
        memo,
      };
      break;
    case "DEALER_SETTLEMENT":
      credit = {
        accountCode: accountCodes.dealer(split.targetId),
        ownerType: "DEALER",
        ownerId: split.targetId,
        name: "Agro-dealer settlements",
        creditLe: amountLe,
        memo,
      };
      break;
    default:
      credit = {
        accountCode: accountCodes.policy(split.targetId),
        ownerType: "POLICY",
        ownerId: split.targetId,
        name: "Insurance",
        creditLe: amountLe,
        memo,
      };
  }
  return [debit, credit];
}

/** Recompute payment + purchase status from the splits; send the farmer receipt once. */
export async function maybeCompletePayment(paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      splits: { orderBy: { order: "asc" } },
      purchase: { include: { crop: true, buyerOrg: true, farmer: { include: { user: true } } } },
    },
  });
  const st = payment.splits.map((s) => s.status);
  const allSuccess = st.every((s) => s === "SUCCESS");
  const active = st.some((s) => s === "PENDING" || s === "PROCESSING");
  const anySuccess = st.some((s) => s === "SUCCESS");
  const started = st.some((s) => s !== "PENDING");
  const status = allSuccess
    ? "SUCCESS"
    : active
      ? started
        ? "PROCESSING"
        : "PENDING"
      : anySuccess
        ? "PARTIAL"
        : "FAILED";
  const final = !active;
  const farmerSplit = payment.splits.find((s) => s.type === "FARMER_WALLET");

  if (status !== payment.status) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status, completedAt: final ? new Date() : null },
    });
  }
  if (payment.purchase) {
    const pStatus =
      farmerSplit?.status === "SUCCESS"
        ? "PAID"
        : final && farmerSplit?.status === "FAILED"
          ? "PAYMENT_FAILED"
          : "PAYMENT_PENDING";
    if (payment.purchase.status !== pStatus && payment.purchase.status !== "CANCELLED") {
      await prisma.purchase.update({
        where: { id: payment.purchase.id },
        data: { status: pStatus },
      });
    }
  }

  // Farmer receipt, exactly once, as soon as their own money has arrived.
  if (farmerSplit?.status === "SUCCESS" && !payment.receiptSentAt && payment.purchase) {
    const marked = await prisma.payment.updateMany({
      where: { id: payment.id, receiptSentAt: null },
      data: { receiptSentAt: new Date() },
    });
    if (marked.count === 1) {
      const p = payment.purchase;
      const wf = payment.explanation as unknown as WaterfallResult | null;
      const breakdown = wf
        ? summariseSplits(wf)
        : `You ${formatLe(farmerSplit.amountLe.toString())}`;
      await sendSms(
        p.farmer.phone,
        `AgriPay: ${p.buyerOrg.name} paid ${formatLe(p.netLe.toString())} for ${p.quantity.toString()}${p.unit} ${p.crop.name}. ${breakdown}. Ref ${payment.ref}`,
        "general",
      );
    }
  }

  if (final && status !== payment.status) {
    await emit("payment.completed", {
      paymentId: payment.id,
      status: status as "SUCCESS" | "PARTIAL" | "FAILED",
    });
  }
  return { status, final };
}

/** Retries and status polls (called by the worker every minute via the internal API). */
export async function processDueInstructions(limit = 100) {
  const now = new Date();
  // Provider said PENDING: poll for the final status.
  const polling = await prisma.providerInstruction.findMany({
    where: { status: "PROCESSING", nextAttemptAt: { lte: now } },
    take: limit,
    include: { split: { select: { paymentId: true } } },
  });
  for (const inst of polling) {
    const claimed = await prisma.providerInstruction.updateMany({
      where: { id: inst.id, status: "PROCESSING", nextAttemptAt: inst.nextAttemptAt },
      data: { nextAttemptAt: new Date(Date.now() + POLL_MS) },
    });
    if (claimed.count !== 1) continue;
    try {
      const res = await adapterFor(inst.provider).getStatus({
        providerRef: inst.providerRef,
        idempotencyKey: inst.idempotencyKey,
      });
      if (res) await applyResult(inst.id, res);
      else
        await prisma.providerInstruction.update({
          where: { id: inst.id },
          data: { status: "PENDING" },
        }); // provider never got it: resend same key
    } catch (e) {
      console.warn("[payments] status poll failed", inst.id, (e as Error).message);
    }
  }
  const due = await prisma.providerInstruction.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    take: limit,
    select: { split: { select: { paymentId: true } } },
  });
  const paymentIds = [
    ...new Set([...due.map((d) => d.split.paymentId), ...polling.map((p) => p.split.paymentId)]),
  ];
  for (const id of paymentIds) await executePayment(id);
  return { polled: polling.length, payments: paymentIds.length };
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

export async function handleProviderCallback(
  code: ProviderCode,
  headers: Record<string, string>,
  rawBody: string,
) {
  const adapter = adapterFor(code);
  const signatureOk = adapter.verifyCallback(headers, rawBody);
  // Store raw first — callbacks are evidence.
  const cb = await prisma.providerCallback.create({
    data: { provider: code, headers, body: rawBody, signatureOk },
  });
  if (!signatureOk) {
    await prisma.providerCallback.update({
      where: { id: cb.id },
      data: { error: "Invalid signature" },
    });
    throw new AppError("UNAUTHENTICATED", "Invalid signature");
  }
  const parsed = adapter.parseCallback(rawBody);
  const inst = parsed
    ? await prisma.providerInstruction.findFirst({
        where: {
          OR: [
            ...(parsed.idempotencyKey ? [{ idempotencyKey: parsed.idempotencyKey }] : []),
            ...(parsed.providerRef ? [{ providerRef: parsed.providerRef }] : []),
          ],
        },
        include: { split: true },
      })
    : null;
  if (!parsed || !inst) {
    await prisma.providerCallback.update({
      where: { id: cb.id },
      data: { error: parsed ? "Unknown transfer" : "Unparseable body", processedAt: new Date() },
    });
    return { ok: false };
  }
  await applyResult(inst.id, parsed);
  await maybeCompletePayment(inst.split.paymentId);
  await prisma.providerCallback.update({ where: { id: cb.id }, data: { processedAt: new Date() } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

export async function retryInstruction(actor: Actor, instructionId: string) {
  if (!can(actor, "payment.admin")) throw forbidden();
  const inst = await prisma.providerInstruction.findUnique({
    where: { id: instructionId },
    include: { split: true },
  });
  if (!inst) throw notFound("Instruction");
  if (inst.status !== "FAILED")
    throw new AppError("CONFLICT", "Only failed instructions can be retried.");
  await prisma.$transaction(async (tx) => {
    await tx.providerInstruction.update({
      where: { id: inst.id },
      data: { status: "PENDING", retryable: true, nextAttemptAt: new Date() },
    });
    await tx.paymentSplit.update({ where: { id: inst.splitId }, data: { status: "PENDING" } });
    await audit(tx, {
      actor,
      action: "payment.instruction_retried",
      entity: "ProviderInstruction",
      entityId: inst.id,
    });
  });
  return executePayment(inst.split.paymentId, { force: true });
}

export async function markInstructionFailed(actor: Actor, instructionId: string, reason: string) {
  if (!can(actor, "payment.admin")) throw forbidden();
  const inst = await prisma.providerInstruction.findUnique({
    where: { id: instructionId },
    include: { split: true },
  });
  if (!inst) throw notFound("Instruction");
  if (FINAL.has(inst.status)) throw new AppError("CONFLICT", "Instruction is already final.");
  await prisma.$transaction(async (tx) => {
    await tx.providerInstruction.update({
      where: { id: inst.id },
      data: { status: "FAILED", retryable: false, lastError: `MANUAL: ${reason}` },
    });
    await tx.paymentSplit.update({ where: { id: inst.splitId }, data: { status: "FAILED" } });
    await audit(tx, {
      actor,
      action: "payment.instruction_failed_manually",
      entity: "ProviderInstruction",
      entityId: inst.id,
      after: { reason },
    });
  });
  return maybeCompletePayment(inst.split.paymentId);
}

export async function listInstructions(actor: Actor, status?: "FAILED" | "PENDING" | "PROCESSING") {
  if (!can(actor, "payment.admin")) throw forbidden();
  return prisma.providerInstruction.findMany({
    where: status ? { status } : { status: { in: ["FAILED", "PENDING", "PROCESSING"] } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { split: { include: { payment: { select: { ref: true, id: true } } } } },
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function paymentScope(actor: Actor): Prisma.PaymentWhereInput {
  if (!can(actor, "payment.read")) throw forbidden();
  if (actor.role === "SUPER_ADMIN") return {};
  if (actor.role === "FARMER") return { farmerId: actor.farmerId ?? "__none__" };
  if (!actor.orgId) throw forbidden();
  return { payerOrgId: actor.orgId };
}

export async function listPayments(
  actor: Actor,
  opts: { status?: string; page?: number; pageSize?: number } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 25;
  const where: Prisma.PaymentWhereInput = {
    ...paymentScope(actor),
    ...(opts.status ? { status: opts.status as Prisma.PaymentWhereInput["status"] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        splits: { orderBy: { order: "asc" } },
        purchase: {
          select: {
            ref: true,
            farmer: { select: { fullName: true, agripayId: true } },
            crop: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return { total, items, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getPayment(actor: Actor, id: string) {
  const payment = await prisma.payment.findFirst({
    where: { AND: [{ id }, paymentScope(actor)] },
    include: {
      splits: { orderBy: { order: "asc" }, include: { instructions: true } },
      purchase: { include: { farmer: true, crop: true, buyerOrg: true } },
    },
  });
  if (!payment) throw notFound("Payment");
  return payment;
}

export async function farmerStatement(actor: Actor, farmerId: string) {
  const farmer = await prisma.farmer.findUnique({ where: { id: farmerId } });
  if (!farmer) throw notFound("Farmer");
  const allowed =
    actor.role === "SUPER_ADMIN" ||
    (actor.role === "FARMER" && actor.farmerId === farmerId) ||
    (can(actor, "payment.read") && !!actor.orgId && farmer.cooperativeId === actor.orgId);
  if (!allowed) throw forbidden();
  const code = accountCodes.farmerWallet(farmer.agripayId);
  const [entries, payments, balance] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { account: { code } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.payment.findMany({
      where: { farmerId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        splits: { orderBy: { order: "asc" } },
        purchase: {
          select: {
            ref: true,
            quantity: true,
            unit: true,
            crop: { select: { name: true } },
            buyerOrg: { select: { name: true } },
          },
        },
      },
    }),
    balanceOf(prisma, code),
  ]);
  return { farmer, entries, payments, totalReceivedLe: balance.toFixed(2) };
}

// ---------------------------------------------------------------------------
// Reconciliation (provider statement CSV until a statement API exists)
// ---------------------------------------------------------------------------

export interface StatementRow {
  providerRef: string;
  amountLe: string;
  status: string;
}

export async function reconcile(
  actor: Actor,
  provider: ProviderCode,
  rows: StatementRow[],
  periodFrom: Date,
  periodTo: Date,
) {
  if (!can(actor, "payment.admin")) throw forbidden();
  const ours = await prisma.providerInstruction.findMany({
    where: { provider, status: "SUCCESS", updatedAt: { gte: periodFrom, lte: periodTo } },
    include: { split: { include: { payment: { select: { ref: true } } } } },
  });
  const byRef = new Map(ours.filter((o) => o.providerRef).map((o) => [o.providerRef!, o]));
  const seen = new Set<string>();
  const matched: string[] = [];
  const mismatched: { providerRef: string; ours: string; theirs: string; reason: string }[] = [];
  const unknown: StatementRow[] = [];
  for (const r of rows) {
    const o = byRef.get(r.providerRef);
    if (!o) {
      unknown.push(r);
      continue;
    }
    seen.add(r.providerRef);
    const amountOk = new Prisma.Decimal(r.amountLe || 0).equals(o.amountLe);
    const statusOk = /^(success|successful|completed|ok)$/i.test(r.status.trim());
    if (amountOk && statusOk) matched.push(r.providerRef);
    else
      mismatched.push({
        providerRef: r.providerRef,
        ours: o.amountLe.toFixed(2),
        theirs: r.amountLe,
        reason: !amountOk ? "AMOUNT" : "STATUS",
      });
  }
  const missing = ours
    .filter((o) => o.providerRef && !seen.has(o.providerRef))
    .map((o) => ({
      providerRef: o.providerRef!,
      payment: o.split.payment.ref,
      amountLe: o.amountLe.toFixed(2),
    }));
  const report = { matched, mismatched, missing, unknown };
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.reconciliationRun.create({
      data: {
        provider,
        periodFrom,
        periodTo,
        matched: matched.length,
        mismatched: mismatched.length + unknown.length,
        missing: missing.length,
        report: report as unknown as Prisma.InputJsonValue,
        createdById: actor.userId,
      },
    });
    await audit(tx, {
      actor,
      action: "payment.reconciled",
      entity: "ReconciliationRun",
      entityId: created.id,
      after: {
        matched: matched.length,
        mismatched: mismatched.length,
        missing: missing.length,
        unknown: unknown.length,
      },
    });
    return created;
  });
  return { run, report };
}
