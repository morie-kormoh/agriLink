import { dealerItemSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { listCatalogue, saveDealerItem } from "@/server/credit/dealers";

export const GET = v1(
  async ({ current, query }) => ({
    data: await listCatalogue(current.actor, { activeOnly: query.get("active") === "1" }),
  }),
  { roles: ["AGRO_DEALER"] },
);
export const POST = v1(
  async ({ current, body }) => ({
    data: await saveDealerItem(current.actor, dealerItemSchema.parse(await body())),
  }),
  { status: 201, roles: ["AGRO_DEALER"] },
);
