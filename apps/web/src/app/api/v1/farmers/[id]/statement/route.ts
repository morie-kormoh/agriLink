import { v1 } from "@/server/api/v1";
import { farmerStatement } from "@/server/payments/service";

/** GET → payments received (with splits) and ledger entries for the farmer's wallet. */
export const GET = v1<{ id: string }>(async ({ current, params }) => {
  const s = await farmerStatement(current.actor, params.id);
  return {
    data: {
      agripayId: s.farmer.agripayId,
      totalReceivedLe: s.totalReceivedLe,
      payments: s.payments,
      entries: s.entries,
    },
  };
});
