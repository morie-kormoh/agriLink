"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/auth/actor";
import { type ActionResult, toActionError } from "@/server/errors";
import { markInstructionFailed, reconcile, retryInstruction } from "@/server/payments/service";

export async function retryInstructionAction(id: string): Promise<ActionResult> {
  try {
    const { actor } = await requireActor(["SUPER_ADMIN"]);
    await retryInstruction(actor, id);
    revalidatePath("/admin/payments");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markInstructionFailedAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor(["SUPER_ADMIN"]);
    await markInstructionFailed(actor, id, reason);
    revalidatePath("/admin/payments");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

const reconSchema = z.object({
  provider: z.enum(["MOCK", "ORANGE_MONEY", "AFRIMONEY", "QMONEY", "SAPS", "BANK"]),
  from: z.coerce.date(),
  to: z.coerce.date(),
  rows: z
    .array(z.object({ providerRef: z.string().min(1), amountLe: z.string(), status: z.string() }))
    .max(20_000),
});

export async function reconcileAction(input: z.input<typeof reconSchema>) {
  try {
    const { actor } = await requireActor(["SUPER_ADMIN"]);
    const d = reconSchema.parse(input);
    const to = new Date(d.to);
    to.setUTCHours(23, 59, 59, 999);
    const r = await reconcile(actor, d.provider, d.rows, d.from, to);
    revalidatePath("/admin/reconciliation");
    return { ok: true as const, data: r.report };
  } catch (e) {
    return toActionError(e);
  }
}
