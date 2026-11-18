import { loanProductSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { listLoanProducts, saveLoanProduct } from "@/server/credit/products";

/** GET loan products (lenders: their own; everyone else: active ones). */
export const GET = v1(async ({ current }) => ({ data: await listLoanProducts(current.actor) }));

/** POST create a product (lender admin) → 201 */
export const POST = v1(
  async ({ current, body }) => ({
    data: await saveLoanProduct(current.actor, loanProductSchema.parse(await body())),
  }),
  { status: 201, roles: ["LENDER_ADMIN"] },
);
