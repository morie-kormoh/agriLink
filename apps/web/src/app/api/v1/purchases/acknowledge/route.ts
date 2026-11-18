import { acknowledgeSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { forbidden } from "@/server/errors";
import { acknowledgePurchase } from "@/server/trade/purchases";

/** Farmer app: POST { reply: "1" | "2", reason?, purchaseRef? } — confirm or report a problem with a purchase. */
export const POST = v1(
  async ({ current, body }) => {
    if (!current.actor.farmerId) throw forbidden();
    const d = acknowledgeSchema.parse(await body());
    return {
      data: await acknowledgePurchase({ farmerId: current.actor.farmerId }, d.reply, {
        reason: d.reason,
        purchaseRef: d.purchaseRef,
      }),
    };
  },
  { roles: ["FARMER"] },
);
