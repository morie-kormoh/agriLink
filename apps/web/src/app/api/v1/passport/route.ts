import { v1 } from "@/server/api/v1";
import { getMyPassport } from "@/server/passport/service";

/** GET the signed-in farmer's passport: current score with factors & tips, history, pending requests, who can see it, who looked. */
export const GET = v1(async ({ current }) => ({ data: await getMyPassport(current.actor) }), {
  roles: ["FARMER"],
});
