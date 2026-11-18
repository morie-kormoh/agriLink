import {
  acceptLoanSchema,
  declineLoanSchema,
  manualRepaymentSchema,
  markDefaultSchema,
  restructureSchema,
} from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import {
  acceptOffer,
  acceptRestructure,
  approveLoan,
  cancelLoan,
  declineLoan,
  markDefault,
  proposeRestructure,
  recordManualRepayment,
} from "@/server/credit/loans";
import { notFound } from "@/server/errors";

/**
 * Farmer (PIN):  accept { pin } · cancel { pin } (before approval, or within 24 h if the voucher is unused) · accept-restructure { pin }
 * Lender:        approve · decline { reason } · repayments { amountLe, reference } · restructure { dueDate, reason } · default { reason }
 */
export const POST = v1<{ id: string; action: string }>(async ({ current, params, body }) => {
  const a = current.actor;
  switch (params.action) {
    case "accept":
      return { data: await acceptOffer(a, params.id, acceptLoanSchema.parse(await body())) };
    case "cancel":
      await cancelLoan(a, params.id, acceptLoanSchema.parse(await body()));
      return { data: { ok: true } };
    case "accept-restructure":
      await acceptRestructure(a, params.id, acceptLoanSchema.parse(await body()));
      return { data: { ok: true } };
    case "approve":
      return { data: await approveLoan(a, params.id) };
    case "decline":
      await declineLoan(a, params.id, declineLoanSchema.parse(await body()));
      return { data: { ok: true } };
    case "repayments":
      return {
        data: await recordManualRepayment(a, params.id, manualRepaymentSchema.parse(await body())),
      };
    case "restructure":
      await proposeRestructure(a, params.id, restructureSchema.parse(await body()));
      return { data: { ok: true } };
    case "default":
      await markDefault(a, params.id, markDefaultSchema.parse(await body()));
      return { data: { ok: true } };
    default:
      throw notFound("Action");
  }
});
