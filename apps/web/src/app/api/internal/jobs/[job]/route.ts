import { NextResponse } from "next/server";
import { api, requireInternalToken } from "@/server/api";
import { notFound } from "@/server/errors";
import { computeScore } from "@/server/passport/service";
import { runDailyJobs, runJob } from "@/server/jobs";

/**
 * Internal (apps/worker, Bearer INTERNAL_API_TOKEN):
 *   POST /api/internal/jobs/daily                — consent & voucher expiry, loan arrears, savings releases
 *   POST /api/internal/jobs/{name}               — one job: savings-releases, loan-arrears, consent-expiry, voucher-expiry, scores-nightly
 *   POST /api/internal/jobs/score { farmerId }   — debounced score recompute
 */
export const POST = api(async (request: Request, ctx: { params: Promise<{ job: string }> }) => {
  requireInternalToken(request);
  const { job } = await ctx.params;
  if (job === "daily") return NextResponse.json(await runDailyJobs());
  if (job === "score") {
    const { farmerId } = (await request.json()) as { farmerId?: string };
    if (!farmerId) throw notFound("Farmer");
    const s = await computeScore(farmerId);
    return NextResponse.json({ score: s.score, band: s.band });
  }
  const result = await runJob(job);
  if (result === null) throw notFound("Job");
  return NextResponse.json(result);
});
