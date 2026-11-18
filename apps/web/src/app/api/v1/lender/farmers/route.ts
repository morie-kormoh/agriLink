import { v1 } from "@/server/api/v1";
import { listConsentedFarmers, searchEligibleFarmers } from "@/server/passport/consent";

/**
 * GET farmers who currently allow access (?cropId, ?districtId, ?minBand).
 * With ?productId: consented eligible farmers + an anonymised count of others (suppressed below 5).
 */
export const GET = v1(
  async ({ current, query }) => {
    const productId = query.get("productId");
    if (productId) return { data: await searchEligibleFarmers(current.actor, productId) };
    return {
      data: await listConsentedFarmers(current.actor, {
        cropId: query.get("cropId") ?? undefined,
        districtId: query.get("districtId") ?? undefined,
        minBand: query.get("minBand") ?? undefined,
      }),
    };
  },
  { roles: ["LENDER_ADMIN", "LENDER_OFFICER"] },
);
