import { earlyWithdrawalSchema, positiveMoney, updateAutoSaveSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { notFound } from "@/server/errors";
import {
  previewEarlyWithdrawal,
  requestEarlyWithdrawal,
  updateAutoSave,
} from "@/server/savings/service";

type P = { id: string; action: string };

/** GET /savings/{id}/early-withdrawal?amountLe=200 → fee preview (show before asking for the PIN). */
export const GET = v1<P>(async ({ current, params, query }) => {
  if (params.action !== "early-withdrawal") throw notFound("Action");
  return {
    data: await previewEarlyWithdrawal(
      current.actor,
      params.id,
      positiveMoney.parse(query.get("amountLe") ?? ""),
    ),
  };
});

/**
 * POST /savings/{id}/auto-save          { pct?, paused?, pin }
 * POST /savings/{id}/early-withdrawal   { amountLe, pin }   (once per season)
 */
export const POST = v1<P>(async ({ current, params, body }) => {
  if (params.action === "auto-save")
    return {
      data: await updateAutoSave(
        current.actor,
        params.id,
        updateAutoSaveSchema.parse(await body()),
      ),
    };
  if (params.action === "early-withdrawal") {
    const r = await requestEarlyWithdrawal(
      current.actor,
      params.id,
      earlyWithdrawalSchema.parse(await body()),
    );
    return {
      data: { paymentRef: r.payment.ref, amountLe: r.amountLe, feeLe: r.feeLe, netLe: r.netLe },
    };
  }
  throw notFound("Action");
});
