import { v1 } from "@/server/api/v1";
import { findFarmersForPurchase } from "@/server/trade/purchases";

/** GET ?q= → farmers to buy from (co-ops: own members by name/phone/ID; buyers: exact AgriLink ID or phone). */
export const GET = v1(async ({ current, query }) => ({
  data: await findFarmersForPurchase(current.actor, query.get("q") ?? ""),
}));
