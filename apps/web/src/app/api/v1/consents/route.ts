import { requestConsentSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { listFarmerConsents, requestConsent } from "@/server/passport/consent";

/** GET the farmer's consent requests and permissions. */
export const GET = v1(async ({ current }) => ({ data: await listFarmerConsents(current.actor) }), {
  roles: ["FARMER"],
});

/** POST (lender) ask a farmer — by AgriLink ID or exact phone — for consent → 201 */
export const POST = v1(
  async ({ current, body }) => {
    const r = await requestConsent(current.actor, requestConsentSchema.parse(await body()));
    return { data: { request: r.request, farmer: r.farmer, duplicate: r.duplicate } };
  },
  { status: 201, roles: ["LENDER_ADMIN", "LENDER_OFFICER"] },
);
