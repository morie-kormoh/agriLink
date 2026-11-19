import { NextResponse } from "next/server";
import { syncFarmersSchema } from "@agrilink/validation";
import { api } from "@/server/api";
import { requireActor } from "@/server/auth/actor";
import { syncFarmers } from "@/server/farmers/sync";

export const dynamic = "force-dynamic";

/**
 * Offline sync (module 02): POST { records: RegisterFarmerInput[] } (max 25).
 * Idempotent per record by `clientRef`; returns one result per record.
 */
export const POST = api(async (request: Request) => {
  const { actor } = await requireActor(["AGENT", "COOP_ADMIN", "COOP_STAFF", "SUPER_ADMIN"]);
  const { records } = syncFarmersSchema.parse(await request.json());
  const results = await syncFarmers(actor, records);
  return NextResponse.json({ results, serverTime: new Date().toISOString() });
});
