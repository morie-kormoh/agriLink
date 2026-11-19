import "server-only";
import { prisma } from "@agrilink/db";
import { formatLe } from "@agrilink/validation";
import { notifyRepayment } from "./credit/loans";
import { recordInputsFromRedemption } from "./credit/vouchers";
import { on } from "./events";
import { scheduleScore } from "./passport/service";
import { recordSaleFromPurchase, removeSaleForPurchase } from "./records/service";
import { notifySavingsMovement } from "./savings/service";
import { sendSms } from "./sms";

// Module 05: purchases become verified SALE records automatically.
on("purchase.recorded", ({ purchaseId }) => recordSaleFromPurchase(purchaseId));
on("purchase.cancelled", ({ purchaseId }) => removeSaleForPurchase(purchaseId));

// Modules 06 & 08: tell the farmer / dealer what just happened with their money (DB effects already applied).
on("split.succeeded", async (e) => {
  switch (e.kind) {
    case "SAVINGS_CREDIT":
      return notifySavingsMovement({
        accountId: e.accountId,
        amountLe: e.amountLe,
        balanceLe: e.balanceLe,
        kind: "CREDIT",
        goalReached: e.goalReached,
      });
    case "SAVINGS_RELEASE":
      return notifySavingsMovement({
        accountId: e.accountId,
        amountLe: e.amountLe,
        balanceLe: e.balanceLe,
        kind: e.early ? "EARLY" : "RELEASE",
        feeLe: e.feeLe,
      });
    case "LOAN_REPAYMENT":
      return notifyRepayment({
        loanId: e.loanId,
        amountLe: e.amountLe,
        outstandingLe: e.outstandingLe,
        fullyRepaid: e.fullyRepaid,
      });
    case "DEALER_SETTLED": {
      const r = await prisma.voucherRedemption.findUnique({
        where: { id: e.redemptionId },
        include: { dealer: true },
      });
      if (r)
        await sendSms(
          r.dealer.payoutMsisdn,
          `AgriLink: ${formatLe(e.amountLe)} settled to your mobile money for voucher redemption ${r.ref}.`,
          "general",
        );
      return;
    }
  }
});

// Module 07: keep the passport score fresh.
on("payment.completed", async ({ paymentId }) => {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { farmerId: true },
  });
  if (p?.farmerId) await scheduleScore(p.farmerId);
});
on("score.stale", ({ farmerId }) => scheduleScore(farmerId));
on("voucher.redeemed", async ({ redemptionId }) => {
  await recordInputsFromRedemption(redemptionId);
  const r = await prisma.voucherRedemption.findUnique({
    where: { id: redemptionId },
    select: { voucher: { select: { farmerId: true } } },
  });
  if (r) await scheduleScore(r.voucher.farmerId);
});
