import { v1 } from "@/server/api/v1";
import { getPassportForLender } from "@/server/passport/service";

/** GET a farmer's passport — 403 without a valid consent; every view is logged and visible to the farmer. */
export const GET = v1<{ id: string }>(
  async ({ current, params }) => ({ data: await getPassportForLender(current.actor, params.id) }),
  { roles: ["LENDER_ADMIN", "LENDER_OFFICER"] },
);
