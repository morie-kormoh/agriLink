import { loanProductSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { getLoanProduct, saveLoanProduct } from "@/server/credit/products";

export const GET = v1<{ id: string }>(async ({ current, params }) => ({
  data: await getLoanProduct(current.actor, params.id),
}));
export const PUT = v1<{ id: string }>(
  async ({ current, params, body }) => ({
    data: await saveLoanProduct(current.actor, loanProductSchema.parse(await body()), params.id),
  }),
  { roles: ["LENDER_ADMIN"] },
);
