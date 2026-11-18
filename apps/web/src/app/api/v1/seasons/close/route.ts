import { closeSeasonSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { closeSeason } from "@/server/records/service";

/** POST { season } → season summaries + SMS for every co-op member with records. */
export const POST = v1(async ({ current, body }) => {
  const { season } = closeSeasonSchema.parse(await body());
  return { data: await closeSeason(current.actor, season) };
});
