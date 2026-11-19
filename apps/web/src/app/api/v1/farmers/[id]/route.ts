import { updateFarmerSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { getFarmer, updateFarmer } from "@/server/farmers/service";

type P = { id: string };

export const GET = v1<P>(async ({ current, params }) => {
  const f = await getFarmer(current.actor, params.id);
  return { data: { ...f, nin: f.nin ? `***${f.nin.slice(-3)}` : null } };
});

export const PATCH = v1<P>(async ({ current, params, body }) => {
  const patch = updateFarmerSchema.parse(await body());
  return { data: await updateFarmer(current.actor, params.id, patch) };
});
