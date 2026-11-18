import { institutionSettingsSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { getInstitution, updateInstitution } from "@/server/finance/common";

/** GET / PUT the institution's funding, collection and custodial accounts and the officer approval limit. */
export const GET = v1(async ({ current }) => ({ data: await getInstitution(current.actor) }), {
  roles: ["LENDER_ADMIN", "LENDER_OFFICER"],
});
export const PUT = v1(
  async ({ current, body }) => ({
    data: await updateInstitution(current.actor, institutionSettingsSchema.parse(await body())),
  }),
  { roles: ["LENDER_ADMIN"] },
);
