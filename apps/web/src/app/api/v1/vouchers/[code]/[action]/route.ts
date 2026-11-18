import { redemptionItemsSchema } from "@agripay/validation";
import { z } from "zod";
import { v1 } from "@/server/api/v1";
import { redeemVoucher, requestRedemptionOtp } from "@/server/credit/vouchers";
import { notFound } from "@/server/errors";

/**
 * POST /vouchers/{code}/otp     { items: [{ itemId, qty }] }  → SMS to the farmer with the amount and items
 * POST /vouchers/{code}/redeem  { items, otp, clientRef? }     → redemption + same-day dealer settlement
 */
export const POST = v1<{ code: string; action: string }>(
  async ({ current, params, body }) => {
    const b = (await body()) as Record<string, unknown>;
    if (params.action === "otp")
      return {
        data: await requestRedemptionOtp(current.actor, {
          code: params.code,
          items: redemptionItemsSchema.parse(b.items),
        }),
      };
    if (params.action === "redeem") {
      const { items, otp, clientRef } = z
        .object({
          items: redemptionItemsSchema,
          otp: z.string(),
          clientRef: z.uuid().optional().nullable(),
        })
        .parse(b);
      return {
        data: await redeemVoucher(current.actor, { code: params.code, items, otp, clientRef }),
      };
    }
    throw notFound("Action");
  },
  { roles: ["AGRO_DEALER"] },
);
