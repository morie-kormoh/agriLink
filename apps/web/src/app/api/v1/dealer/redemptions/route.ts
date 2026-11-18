import { v1 } from "@/server/api/v1";
import { dealerRedemptions } from "@/server/credit/dealers";

/** GET redemptions with settlement status and totals. */
export const GET = v1(async ({ current }) => ({ data: await dealerRedemptions(current.actor) }), {
  roles: ["AGRO_DEALER"],
});
