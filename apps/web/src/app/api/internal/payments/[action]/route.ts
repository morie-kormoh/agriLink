import { NextResponse } from "next/server";
import { z } from "zod";
import { api, requireInternalToken } from "@/server/api";
import { notFound } from "@/server/errors";
import { executePayment, processDueInstructions } from "@/server/payments/service";

/**
 * Internal (apps/worker, Bearer INTERNAL_API_TOKEN):
 *   POST /api/internal/payments/tick                   — retries + status polls (every minute)
 *   POST /api/internal/payments/execute { paymentId }  — run a queued payment
 */
export const POST = api(async (request: Request, ctx: { params: Promise<{ action: string }> }) => {
  requireInternalToken(request);
  const { action } = await ctx.params;
  if (action === "tick") return NextResponse.json(await processDueInstructions());
  if (action === "execute") {
    const { paymentId } = z.object({ paymentId: z.string().min(1) }).parse(await request.json());
    return NextResponse.json(await executePayment(paymentId));
  }
  throw notFound("Action");
});

/** Vercel Cron / external scheduler: GET /api/internal/payments/tick (retries and status polls). */
export const GET = api(async (request: Request, ctx: { params: Promise<{ action: string }> }) => {
  requireInternalToken(request);
  const { action } = await ctx.params;
  if (action === "tick") return NextResponse.json(await processDueInstructions());
  throw notFound("Action");
});
