import { syncFarmersSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { syncFarmers } from "@/server/farmers/sync";

/** POST { records: RegisterFarmer[] } (max 25) → one result per record. Idempotent per clientRef. */
export const POST = v1(
  async ({ current, body }) => {
    const { records } = syncFarmersSchema.parse(await body());
    return {
      data: {
        results: await syncFarmers(current.actor, records),
        serverTime: new Date().toISOString(),
      },
    };
  },
  { roles: ["AGENT", "COOP_ADMIN", "COOP_STAFF", "SUPER_ADMIN"] },
);
