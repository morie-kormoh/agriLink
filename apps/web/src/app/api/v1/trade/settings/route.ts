import { v1 } from "@/server/api/v1";
import { getTradeSettings, updateBuyerSettings, updateCoopSettings } from "@/server/trade/settings";

/** GET → co-op or buyer trade settings (dues, approval threshold, funding account). */
export const GET = v1(async ({ current }) => ({ data: await getTradeSettings(current.actor) }));

/** PUT CoopSettings | BuyerSettings */
export const PUT = v1(async ({ current, body }) => {
  const s = await getTradeSettings(current.actor);
  const input = (await body()) as Record<string, unknown>;
  return {
    data:
      s.kind === "COOPERATIVE"
        ? await updateCoopSettings(current.actor, input)
        : await updateBuyerSettings(current.actor, input as never),
  };
});
