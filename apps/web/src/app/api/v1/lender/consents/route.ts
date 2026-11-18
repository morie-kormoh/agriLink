import { v1 } from "@/server/api/v1";
import { listLenderConsents } from "@/server/passport/consent";

/** GET consent requests this institution sent (?status=GRANTED). */
export const GET = v1(
  async ({ current, query }) => ({
    data: await listLenderConsents(current.actor, query.get("status") ?? undefined),
  }),
  { roles: ["LENDER_ADMIN", "LENDER_OFFICER"] },
);
