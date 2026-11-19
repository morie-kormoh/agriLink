import { dealerItemSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { saveDealerItem } from "@/server/credit/dealers";

export const PUT = v1<{ id: string }>(
  async ({ current, params, body }) => ({
    data: await saveDealerItem(current.actor, dealerItemSchema.parse(await body()), params.id),
  }),
  { roles: ["AGRO_DEALER"] },
);
