import { prisma } from "@agrilink/db";
import { positiveMoney } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { checkEligibility } from "@/server/credit/eligibility";
import { disclosureFor, getLoanProduct } from "@/server/credit/products";
import { forbidden, notFound } from "@/server/errors";

/**
 * GET /loan-products/{id}/eligibility             (farmer) eligible?, reasons, limit, affordability
 * GET /loan-products/{id}/disclosure?amountLe=     plain-language terms shown before the PIN (?lang=kri)
 */
export const GET = v1<{ id: string; view: string }>(async ({ current, params, query }) => {
  await getLoanProduct(current.actor, params.id);
  if (params.view === "eligibility") {
    if (current.actor.role !== "FARMER" || !current.actor.farmerId) throw forbidden();
    return {
      data: await checkEligibility(prisma, current.actor.farmerId, params.id, {
        consentRequired: false,
      }),
    };
  }
  if (params.view === "disclosure") {
    const amount = positiveMoney.parse(query.get("amountLe") ?? "");
    return {
      data: await disclosureFor(params.id, amount, query.get("lang") === "kri" ? "kri" : "en"),
    };
  }
  throw notFound("View");
});
