import { currentSeason, seasonCode } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { getSeasonOverview } from "@/server/records/service";

/** GET ?season → spent / sold / net / harvest for one season. */
export const GET = v1<{ id: string }>(async ({ current, params, query }) => {
  const season = seasonCode.parse(query.get("season") ?? currentSeason());
  return { data: await getSeasonOverview(current.actor, params.id, season) };
});
