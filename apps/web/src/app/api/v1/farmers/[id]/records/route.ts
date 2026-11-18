import { addRecordSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { addRecord, listRecords, seasonsFor } from "@/server/records/service";

type P = { id: string };

/** GET ?season=2027-MAIN → farm records (newest first) and the seasons that have records. */
export const GET = v1<P>(async ({ current, params, query }) => {
  const season = query.get("season") ?? undefined;
  const [records, seasons] = await Promise.all([
    listRecords(current.actor, params.id, season),
    seasonsFor(current.actor, params.id),
  ]);
  return { data: records, meta: { seasons } };
});

/** POST AddRecord → 201 */
export const POST = v1<P>(
  async ({ current, params, body }) => ({
    data: await addRecord(current.actor, params.id, addRecordSchema.parse(await body())),
  }),
  { status: 201 },
);
