import { collectionPointSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { createCollectionPoint, listCollectionPoints } from "@/server/trade/settings";

export const GET = v1(async ({ current }) => ({ data: await listCollectionPoints(current.actor) }));

export const POST = v1(
  async ({ current, body }) => ({
    data: await createCollectionPoint(current.actor, collectionPointSchema.parse(await body())),
  }),
  { status: 201 },
);
