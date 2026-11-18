import { v1 } from "@/server/api/v1";
import { getReferenceData } from "@/server/reference";

export const dynamic = "force-dynamic";

/** GET → districts (with chiefdoms), crops and the caller's cooperatives — cache on the device for offline forms. */
export const GET = v1(async ({ current }) => ({ data: await getReferenceData(current.actor) }));
