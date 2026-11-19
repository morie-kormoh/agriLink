import { listPurchasesSchema, recordPurchaseSchema } from "@agrilink/validation";
import { page, queryObject, v1 } from "@/server/api/v1";
import { listPurchases, recordPurchase } from "@/server/trade/purchases";

export const dynamic = "force-dynamic";

/** GET ?status&batchId&farmerId&q&page → purchases (co-op/buyer: their own; farmer: theirs). */
export const GET = v1(async ({ current, query }) => {
  const r = await listPurchases(current.actor, listPurchasesSchema.parse(queryObject(query)));
  return page(r.items, { page: r.page, pages: r.pages, total: r.total });
});

/** POST RecordPurchase → 201. Amounts are computed by the server. Send `clientRef` for safe retries. */
export const POST = v1(
  async ({ current, body }) => ({
    data: await recordPurchase(current.actor, recordPurchaseSchema.parse(await body())),
  }),
  { status: 201 },
);
