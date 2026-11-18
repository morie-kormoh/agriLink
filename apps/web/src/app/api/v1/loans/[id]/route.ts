import { v1 } from "@/server/api/v1";
import { getLoan } from "@/server/credit/loans";

/** GET loan with voucher, redemptions, repayments, outstanding, days past due and a timeline. */
export const GET = v1<{ id: string }>(async ({ current, params }) => ({
  data: await getLoan(current.actor, params.id),
}));
