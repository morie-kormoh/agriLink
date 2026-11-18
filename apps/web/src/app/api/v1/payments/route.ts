import { z } from "zod";
import { page, v1 } from "@/server/api/v1";
import { listPayments } from "@/server/payments/service";

export const dynamic = "force-dynamic";

/** GET ?status&page → payments (payer org: theirs; farmer: received). */
export const GET = v1(async ({ current, query }) => {
  const q = z
    .object({
      status: z
        .enum(["PENDING", "PROCESSING", "SUCCESS", "PARTIAL", "FAILED", "CANCELLED"])
        .optional(),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse({ status: query.get("status") ?? undefined, page: query.get("page") ?? undefined });
  const r = await listPayments(current.actor, q);
  return page(r.items, { page: r.page, pages: r.pages, total: r.total });
});
