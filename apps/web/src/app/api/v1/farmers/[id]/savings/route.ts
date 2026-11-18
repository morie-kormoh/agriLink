import { v1 } from "@/server/api/v1";
import { getSavingsSummary } from "@/server/savings/service";

/** GET a farmer's savings: accounts (with available balance and recent transactions), open products and groups. */
export const GET = v1<{ id: string }>(async ({ current, params }) => ({
  data: await getSavingsSummary(current.actor, params.id),
}));
