import { createGroupSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { createGroup, listGroups } from "@/server/savings/groups";

/** GET savings groups in scope (co-op staff: the co-op's groups; farmer: their own). */
export const GET = v1(async ({ current }) => ({ data: await listGroups(current.actor) }));

/** POST create a group (co-op admin) → 201 */
export const POST = v1(
  async ({ current, body }) => ({
    data: await createGroup(current.actor, createGroupSchema.parse(await body())),
  }),
  { status: 201 },
);
