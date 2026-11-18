import { v1 } from "@/server/api/v1";
import { getPortfolio } from "@/server/credit/portfolio";

/** GET portfolio metrics (?productId, ?districtId): disbursed, outstanding, PAR30/90, repayment rate; by district / gender / crop / product. */
export const GET = v1(
  async ({ current, query }) => ({
    data: await getPortfolio(current.actor, {
      productId: query.get("productId") ?? undefined,
      districtId: query.get("districtId") ?? undefined,
    }),
  }),
  { roles: ["LENDER_ADMIN", "LENDER_OFFICER"] },
);
