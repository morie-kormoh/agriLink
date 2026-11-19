import { dealerProfileSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { dealerFor, saveDealerProfile } from "@/server/credit/dealers";

/** GET / PUT the shop profile (district, payout wallet). Changing the payout number needs re-verification. */
export const GET = v1(async ({ current }) => ({ data: await dealerFor(current.actor) }), {
  roles: ["AGRO_DEALER"],
});
export const PUT = v1(
  async ({ current, body }) => ({
    data: await saveDealerProfile(current.actor, dealerProfileSchema.parse(await body())),
  }),
  { roles: ["AGRO_DEALER"] },
);
