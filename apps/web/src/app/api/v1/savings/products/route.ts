import { v1 } from "@/server/api/v1";
import { listSavingsProducts } from "@/server/savings/service";

/** GET active savings products (Harvest Lock, goals). */
export const GET = v1(async ({ current }) => ({ data: await listSavingsProducts(current.actor) }));
