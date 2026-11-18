import { NextResponse } from "next/server";
import { api } from "@/server/api";
import { requireActor } from "@/server/auth/actor";
import { getReferenceData } from "@/server/reference";

export const dynamic = "force-dynamic";

/** Districts, chiefdoms, crops and the actor's cooperatives — cached in IndexedDB by the agent PWA. */
export const GET = api(async () => {
  const { actor } = await requireActor();
  const data = await getReferenceData(actor);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=300" } });
});
