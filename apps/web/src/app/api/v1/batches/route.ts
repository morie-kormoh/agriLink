import { z } from "zod";
import { v1 } from "@/server/api/v1";
import { listBatches } from "@/server/trade/batches";

export const dynamic = "force-dynamic";

/** GET ?status=OPEN|SUBMITTED|APPROVED → batches with counts and totals. */
export const GET = v1(async ({ current, query }) => {
  const status = z
    .enum(["OPEN", "SUBMITTED", "APPROVED"])
    .optional()
    .parse(query.get("status") ?? undefined);
  const rows = await listBatches(current.actor, { status });
  return { data: rows.map(({ purchases: _p, ...b }) => b) };
});
