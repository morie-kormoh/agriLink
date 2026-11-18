import { v1 } from "@/server/api/v1";
import { getPayment } from "@/server/payments/service";

export const GET = v1<{ id: string }>(async ({ current, params }) => ({
  data: await getPayment(current.actor, params.id),
}));
