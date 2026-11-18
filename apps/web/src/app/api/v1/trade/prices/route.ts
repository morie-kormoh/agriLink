import { setPriceSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { listActivePrices, setPrice } from "@/server/trade/settings";

/** GET → active prices for the caller's co-op/buyer. */
export const GET = v1(async ({ current }) => ({ data: await listActivePrices(current.actor) }));

/** POST { cropId, grade?, unit, priceLe } → new price (closes the previous one). */
export const POST = v1(
  async ({ current, body }) => ({
    data: await setPrice(current.actor, setPriceSchema.parse(await body())),
  }),
  { status: 201 },
);
