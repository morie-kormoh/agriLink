import { cancelPurchaseSchema, resolveDisputeSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { notFound } from "@/server/errors";
import { approvePurchase } from "@/server/trade/batches";
import { cancelPurchase, resolveDispute } from "@/server/trade/purchases";

/**
 * POST /purchases/{id}/cancel           { reason }
 * POST /purchases/{id}/approve          (second person; for purchases held over the threshold)
 * POST /purchases/{id}/resolve-dispute  { outcome: UPHOLD|REJECT, note }
 */
export const POST = v1<{ id: string; action: string }>(async ({ current, params, body }) => {
  switch (params.action) {
    case "cancel": {
      const { reason } = cancelPurchaseSchema.parse(await body());
      await cancelPurchase(current.actor, params.id, reason);
      return { data: { ok: true } };
    }
    case "approve": {
      const payment = await approvePurchase(current.actor, params.id);
      return { data: { paymentId: payment.id, paymentRef: payment.ref } };
    }
    case "resolve-dispute": {
      const { outcome, note } = resolveDisputeSchema.parse(await body());
      await resolveDispute(current.actor, params.id, outcome, note);
      return { data: { ok: true } };
    }
    default:
      throw notFound("Action");
  }
});
