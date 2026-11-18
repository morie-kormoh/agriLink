"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type {
  buyerSettingsSchema,
  collectionPointSchema,
  coopSettingsSchema,
  recordPurchaseSchema,
  setPriceSchema,
} from "@agripay/validation";
import { requireActor } from "@/server/auth/actor";
import { type ActionResult, toActionError } from "@/server/errors";
import { previewWaterfall } from "@/server/payments/service";
import { approveBatch, approvePurchase, submitBatch } from "@/server/trade/batches";
import {
  acknowledgePurchase,
  cancelPurchase,
  findFarmersForPurchase,
  recordPurchase,
  resolveDispute,
} from "@/server/trade/purchases";
import {
  createCollectionPoint,
  setCollectionPointActive,
  setPrice,
  updateBuyerSettings,
  updateCoopSettings,
} from "@/server/trade/settings";

const PORTALS = ["/coop", "/buyer"];
function revalidateTrade() {
  for (const p of PORTALS) revalidatePath(p, "layout");
}

export async function findFarmersAction(q: string) {
  try {
    const { actor } = await requireActor();
    return { ok: true as const, data: await findFarmersForPurchase(actor, q) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function recordPurchaseAction(input: z.input<typeof recordPurchaseSchema>) {
  try {
    const { actor } = await requireActor();
    const r = await recordPurchase(actor, input);
    revalidateTrade();
    return { ok: true as const, data: r };
  } catch (e) {
    return toActionError(e);
  }
}

export async function previewWaterfallAction(farmerId: string, grossLe: string) {
  try {
    const { actor } = await requireActor();
    return { ok: true as const, data: await previewWaterfall(actor, farmerId, grossLe) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitBatchAction(batchId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await submitBatch(actor, batchId);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveBatchAction(batchId: string) {
  try {
    const { actor } = await requireActor();
    const r = await approveBatch(actor, batchId);
    revalidateTrade();
    return { ok: true as const, data: { approved: r.approved, held: r.held } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approvePurchaseAction(purchaseId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await approvePurchase(actor, purchaseId);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelPurchaseAction(
  purchaseId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await cancelPurchase(actor, purchaseId, reason);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resolveDisputeAction(
  purchaseId: string,
  outcome: "UPHOLD" | "REJECT",
  note: string,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await resolveDispute(actor, purchaseId, outcome, note);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function acknowledgePurchaseAction(
  purchaseRef: string,
  reply: "1" | "2",
  reason?: string,
) {
  try {
    const { actor } = await requireActor(["FARMER"]);
    const r = await acknowledgePurchase({ farmerId: actor.farmerId ?? "" }, reply, {
      purchaseRef,
      reason,
    });
    revalidatePath("/farmer/sales");
    return { ok: true as const, data: r };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setPriceAction(input: z.input<typeof setPriceSchema>): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await setPrice(actor, input);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateCoopSettingsAction(
  input: z.input<typeof coopSettingsSchema>,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await updateCoopSettings(actor, input);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateBuyerSettingsAction(
  input: z.input<typeof buyerSettingsSchema>,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await updateBuyerSettings(actor, input);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createCollectionPointAction(
  input: z.input<typeof collectionPointSchema>,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await createCollectionPoint(actor, input);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setCollectionPointActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await setCollectionPointActive(actor, id, active);
    revalidateTrade();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
