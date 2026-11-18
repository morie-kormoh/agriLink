"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { addPlotSchema, addWalletSchema, updateFarmerSchema } from "@agripay/validation";
import { requireActor } from "@/server/auth/actor";
import { type ActionResult, toActionError } from "@/server/errors";
import { commitImport, previewImport } from "@/server/farmers/import";
import {
  addPlot,
  addWallet,
  resolveDuplicate,
  updateFarmer,
  verifyWallet,
} from "@/server/farmers/service";

function revalidateFarmer(id: string) {
  for (const prefix of ["/agent/farmers", "/coop/members", "/admin/farmers"]) {
    revalidatePath(prefix);
    revalidatePath(`${prefix}/${id}`);
  }
  revalidatePath("/farmer");
}

export async function updateFarmerAction(
  id: string,
  patch: z.input<typeof updateFarmerSchema>,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await updateFarmer(actor, id, patch);
    revalidateFarmer(id);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addWalletAction(
  farmerId: string,
  input: z.input<typeof addWalletSchema>,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await addWallet(actor, farmerId, input);
    revalidateFarmer(farmerId);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function verifyWalletAction(
  farmerId: string,
  walletId: string,
): Promise<ActionResult<{ match: boolean; kycTier: number }>> {
  try {
    const { actor } = await requireActor();
    const r = await verifyWallet(actor, walletId);
    revalidateFarmer(farmerId);
    return { ok: true, data: { match: r.match, kycTier: r.kycTier } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addPlotAction(
  farmerId: string,
  input: z.input<typeof addPlotSchema>,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await addPlot(actor, farmerId, input);
    revalidateFarmer(farmerId);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resolveDuplicateAction(
  farmerId: string,
  outcome: "NOT_DUPLICATE" | "DEACTIVATE",
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await resolveDuplicate(actor, farmerId, outcome);
    revalidatePath("/coop/members/duplicates");
    revalidateFarmer(farmerId);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function previewImportAction(rows: Record<string, unknown>[]) {
  try {
    const { actor } = await requireActor();
    const preview = await previewImport(actor, rows);
    return {
      ok: true as const,
      data: {
        valid: preview.valid.map((v) => ({ row: v.row, label: v.label })),
        invalid: preview.invalid,
      },
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function commitImportAction(rows: Record<string, unknown>[]) {
  try {
    const { actor } = await requireActor();
    const result = await commitImport(actor, rows);
    revalidatePath("/coop/members");
    return { ok: true as const, data: result };
  } catch (e) {
    return toActionError(e);
  }
}
