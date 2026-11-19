import { applyLoanSchema, makeOfferSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { applyForLoan, farmerLoanOverview, listLoans, makeOffer } from "@/server/credit/loans";

/**
 * GET loans in scope. Farmers get an overview (loans + eligible products + dealers);
 * lenders get a paged list (?queue=1 for applications awaiting a decision, ?status=LATE,REPAYING, ?page).
 */
export const GET = v1(async ({ current, query }) => {
  if (current.actor.role === "FARMER") return { data: await farmerLoanOverview(current.actor) };
  const r = await listLoans(current.actor, {
    queue: query.get("queue") === "1",
    status: query.get("status")?.split(",").filter(Boolean),
    page: Number(query.get("page") ?? 1) || 1,
  });
  return { data: r.items, meta: { page: r.page, pages: r.pages, total: r.total } };
});

/**
 * POST — farmer: apply { productId, amountLe, pin } (applying shares the passport with that lender);
 *        lender: offer { farmerId, productId, amountLe } (needs the farmer's consent; the farmer accepts with PIN).
 */
export const POST = v1(
  async ({ current, body }) => {
    const b = await body();
    if (current.actor.role === "FARMER")
      return { data: await applyForLoan(current.actor, applyLoanSchema.parse(b)) };
    return { data: await makeOffer(current.actor, makeOfferSchema.parse(b)) };
  },
  { status: 201, roles: ["FARMER", "LENDER_ADMIN", "LENDER_OFFICER"] },
);
