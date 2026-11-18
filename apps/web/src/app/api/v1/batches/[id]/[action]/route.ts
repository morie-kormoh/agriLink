import { v1 } from "@/server/api/v1";
import { notFound } from "@/server/errors";
import { approveBatch, submitBatch } from "@/server/trade/batches";

/**
 * POST /batches/{id}/submit   — send the day's purchases for approval
 * POST /batches/{id}/approve  — second person approves & pays (held purchases are listed in the response)
 */
export const POST = v1<{ id: string; action: string }>(async ({ current, params }) => {
  if (params.action === "submit") {
    await submitBatch(current.actor, params.id);
    return { data: { ok: true } };
  }
  if (params.action === "approve") return { data: await approveBatch(current.actor, params.id) };
  throw notFound("Action");
});
