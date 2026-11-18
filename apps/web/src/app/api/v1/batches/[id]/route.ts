import { v1 } from "@/server/api/v1";
import { getBatch } from "@/server/trade/batches";

export const GET = v1<{ id: string }>(async ({ current, params }) => ({
  data: await getBatch(current.actor, params.id),
}));
