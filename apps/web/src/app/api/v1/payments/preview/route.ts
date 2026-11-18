import { previewWaterfallSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { previewWaterfall } from "@/server/payments/service";

/** POST { farmerId, grossLe } → how a payment would be split (no side effects). */
export const POST = v1(async ({ current, body }) => {
  const { farmerId, grossLe } = previewWaterfallSchema.parse(await body());
  return { data: await previewWaterfall(current.actor, farmerId, grossLe) };
});
