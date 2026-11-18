import { v1 } from "@/server/api/v1";
import { lookupVoucher } from "@/server/credit/vouchers";

/** GET (agro-dealer) what this voucher can buy at your shop: first name + initial, remaining value, allowed categories. */
export const GET = v1<{ code: string }>(
  async ({ current, params }) => ({ data: await lookupVoucher(current.actor, params.code) }),
  { roles: ["AGRO_DEALER"] },
);
