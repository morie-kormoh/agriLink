"use server";

import { revalidatePath } from "next/cache";
import type { AddRecordInput } from "@agripay/validation";
import { requireActor } from "@/server/auth/actor";
import { type ActionResult, toActionError } from "@/server/errors";
import { addRecord, closeSeason, deleteRecord } from "@/server/records/service";

function revalidateRecords() {
  for (const p of ["/farmer", "/agent", "/coop"]) revalidatePath(p, "layout");
}

export async function addRecordAction(
  farmerId: string,
  input: AddRecordInput,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await addRecord(actor, farmerId, input);
    revalidateRecords();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteRecordAction(id: string): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await deleteRecord(actor, id);
    revalidateRecords();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function closeSeasonAction(season: string) {
  try {
    const { actor } = await requireActor(["COOP_ADMIN"]);
    const r = await closeSeason(actor, season);
    revalidatePath("/coop/seasons");
    return { ok: true as const, data: r };
  } catch (e) {
    return toActionError(e);
  }
}
