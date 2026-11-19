import "server-only";
import { Prisma, type SplitType, type Tx } from "@agrilink/db";
import { nextReleaseDate } from "@agrilink/finance";
import { accountCodes, postJournal } from "./ledger";

/**
 * Business effects of a confirmed transfer (modules 06 & 08), applied inside the same database transaction
 * that marks the transfer SUCCESS and posts the ledger journal — so savings balances and loan balances can
 * never drift from the ledger. Each effect is idempotent per split (unique splitId on the effect rows).
 * Side effects outside the database (SMS, score recompute) run afterwards from the "split.succeeded" event.
 */
export type SplitEffect =
  | {
      kind: "SAVINGS_CREDIT";
      accountId: string;
      farmerId: string | null;
      amountLe: string;
      balanceLe: string;
      goalReached: boolean;
    }
  | {
      kind: "LOAN_REPAYMENT";
      loanId: string;
      farmerId: string;
      amountLe: string;
      outstandingLe: string;
      fullyRepaid: boolean;
    }
  | {
      kind: "SAVINGS_RELEASE";
      accountId: string;
      farmerId: string | null;
      amountLe: string;
      feeLe: string;
      balanceLe: string;
      early: boolean;
    }
  | { kind: "DEALER_SETTLED"; redemptionId: string; amountLe: string };

interface PaymentLike {
  id: string;
  type: string;
  ref: string;
  payerOrgId: string | null;
  context: Prisma.JsonValue | null;
}
interface SplitLike {
  id: string;
  type: SplitType;
  targetId: string;
  amountLe: Prisma.Decimal;
}

export async function onSplitSucceeded(
  tx: Tx,
  payment: PaymentLike,
  split: SplitLike,
): Promise<SplitEffect | null> {
  const ctx = (payment.context ?? {}) as Record<string, string | boolean | undefined>;
  if (split.type === "SAVINGS") return creditSavings(tx, payment, split);
  if (split.type === "LOAN_REPAYMENT") return applyRepayment(tx, payment, split);
  if (
    split.type === "FARMER_WALLET" &&
    payment.type === "SAVINGS_RELEASE" &&
    typeof ctx.savingsAccountId === "string"
  ) {
    return releaseSavings(
      tx,
      payment,
      split,
      ctx.savingsAccountId,
      String(ctx.feeLe ?? "0"),
      ctx.early === true,
    );
  }
  if (split.type === "DEALER_SETTLEMENT" && typeof ctx.redemptionId === "string") {
    await tx.voucherRedemption.update({
      where: { id: ctx.redemptionId },
      data: { settledAt: new Date() },
    });
    return {
      kind: "DEALER_SETTLED",
      redemptionId: ctx.redemptionId,
      amountLe: split.amountLe.toFixed(2),
    };
  }
  return null;
}

async function lockSavings(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "SavingsAccount" WHERE id = ${id} FOR UPDATE`;
  return tx.savingsAccount.findUniqueOrThrow({ where: { id }, include: { product: true } });
}

async function creditSavings(tx: Tx, payment: PaymentLike, split: SplitLike): Promise<SplitEffect> {
  const acc = await lockSavings(tx, split.targetId);
  const balance = acc.balanceLe.plus(split.amountLe);
  await tx.savingsTransaction.create({
    data: {
      accountId: acc.id,
      type: "CREDIT_AUTO",
      amountLe: split.amountLe,
      balanceAfterLe: balance,
      paymentId: payment.id,
      splitId: split.id,
      note: payment.ref,
    },
  });
  const goalReached = !!acc.goalLe && balance.gte(acc.goalLe) && acc.balanceLe.lt(acc.goalLe);
  await tx.savingsAccount.update({ where: { id: acc.id }, data: { balanceLe: balance } });
  if (goalReached && acc.splitRuleId) {
    // Goal reached: stop auto-saving so the farmer keeps the rest of future sales.
    await tx.splitRule.update({ where: { id: acc.splitRuleId }, data: { active: false } });
  }
  return {
    kind: "SAVINGS_CREDIT",
    accountId: acc.id,
    farmerId: acc.farmerId,
    amountLe: split.amountLe.toFixed(2),
    balanceLe: balance.toFixed(2),
    goalReached,
  };
}

async function applyRepayment(
  tx: Tx,
  payment: PaymentLike,
  split: SplitLike,
): Promise<SplitEffect> {
  await tx.$queryRaw`SELECT id FROM "Loan" WHERE id = ${split.targetId} FOR UPDATE`;
  const loan = await tx.loan.findUniqueOrThrow({ where: { id: split.targetId } });
  await tx.loanRepayment.create({
    data: {
      loanId: loan.id,
      amountLe: split.amountLe,
      source: "HARVEST_SPLIT",
      paymentId: payment.id,
      splitId: split.id,
    },
  });
  const repaid = loan.repaidLe.plus(split.amountLe);
  const outstanding = Prisma.Decimal.max((loan.totalDueLe ?? repaid).minus(repaid), 0);
  // While the voucher can still be used more may become owed, so the loan stays open.
  const voucherOpen = await tx.inputVoucher.count({
    where: { loanId: loan.id, status: { in: ["ISSUED", "PARTIALLY_REDEEMED"] } },
  });
  const fullyRepaid = outstanding.lte(0) && voucherOpen === 0;
  await tx.loan.update({
    where: { id: loan.id },
    data: {
      repaidLe: repaid,
      ...(fullyRepaid
        ? { status: "REPAID", repaidAt: new Date() }
        : loan.status === "DISBURSED"
          ? { status: "REPAYING" }
          : {}),
    },
  });
  if (fullyRepaid && loan.splitRuleId)
    await tx.splitRule.update({ where: { id: loan.splitRuleId }, data: { active: false } });
  return {
    kind: "LOAN_REPAYMENT",
    loanId: loan.id,
    farmerId: loan.farmerId,
    amountLe: split.amountLe.toFixed(2),
    outstandingLe: outstanding.toFixed(2),
    fullyRepaid,
  };
}

async function releaseSavings(
  tx: Tx,
  payment: PaymentLike,
  split: SplitLike,
  accountId: string,
  feeLe: string,
  early: boolean,
): Promise<SplitEffect> {
  const acc = await lockSavings(tx, accountId);
  const fee = new Prisma.Decimal(feeLe || 0);
  let balance = acc.balanceLe.minus(split.amountLe);
  await tx.savingsTransaction.create({
    data: {
      accountId,
      type: early ? "EARLY_WITHDRAWAL" : "RELEASE",
      amountLe: split.amountLe,
      balanceAfterLe: balance,
      paymentId: payment.id,
      splitId: split.id,
      note: payment.ref,
    },
  });
  if (fee.gt(0)) {
    balance = balance.minus(fee);
    await tx.savingsTransaction.create({
      data: {
        accountId,
        type: "FEE",
        amountLe: fee,
        balanceAfterLe: balance,
        paymentId: payment.id,
        splitId: split.id,
        note: "Early withdrawal fee",
      },
    });
    const custodian = acc.product.custodianOrgId;
    await postJournal(
      tx,
      [
        {
          accountCode: accountCodes.savings(accountId),
          ownerType: "SAVINGS",
          ownerId: accountId,
          name: "Savings",
          debitLe: fee.toFixed(2),
          memo: `${payment.ref} fee`,
        },
        {
          accountCode: accountCodes.fees(custodian),
          ownerType: "ORG",
          ownerId: custodian,
          name: "Fees earned",
          creditLe: fee.toFixed(2),
          memo: `${payment.ref} fee`,
        },
      ],
      payment.id,
    );
  }
  const data: Prisma.SavingsAccountUpdateInput = { balanceLe: balance };
  if (!early) {
    if (acc.product.type === "GOAL") data.status = "RELEASED";
    else if (acc.product.releaseMonthDay) {
      // Next season: the release date after this one (or after today if the release ran late).
      const from = new Date(Math.max(Date.now(), acc.lockedUntil?.getTime() ?? 0));
      data.lockedUntil = nextReleaseDate(acc.product.releaseMonthDay, from);
    }
  }
  await tx.savingsAccount.update({ where: { id: accountId }, data });
  return {
    kind: "SAVINGS_RELEASE",
    accountId,
    farmerId: acc.farmerId,
    amountLe: split.amountLe.toFixed(2),
    feeLe: fee.toFixed(2),
    balanceLe: balance.toFixed(2),
    early,
  };
}
