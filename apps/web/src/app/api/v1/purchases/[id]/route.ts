import { v1 } from "@/server/api/v1";
import { getPurchase } from "@/server/trade/purchases";

export const GET = v1<{ id: string }>(async ({ current, params }) => ({
  data: await getPurchase(current.actor, params.id),
}));
