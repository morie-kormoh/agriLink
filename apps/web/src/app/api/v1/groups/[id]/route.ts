import { v1 } from "@/server/api/v1";
import { getGroup } from "@/server/savings/groups";

/** GET group with members, per-period contributions, payouts and next rotating recipient. */
export const GET = v1<{ id: string }>(async ({ current, params }) => ({
  data: await getGroup(current.actor, params.id),
}));
