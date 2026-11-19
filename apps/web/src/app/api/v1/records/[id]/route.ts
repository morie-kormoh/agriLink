import { updateRecordSchema } from "@agrilink/validation";
import { v1 } from "@/server/api/v1";
import { deleteRecord, updateRecord } from "@/server/records/service";

type P = { id: string };

export const PATCH = v1<P>(async ({ current, params, body }) => ({
  data: await updateRecord(current.actor, params.id, updateRecordSchema.parse(await body())),
}));

export const DELETE = v1<P>(async ({ current, params }) => {
  await deleteRecord(current.actor, params.id);
  return { data: { ok: true } };
});
