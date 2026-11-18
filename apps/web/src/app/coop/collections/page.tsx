import { BatchesList } from "@/components/trade/batches-list";
import { requirePortal } from "@/server/auth/actor";

export default async function Page() {
  const { actor } = await requirePortal("/coop");
  return <BatchesList actor={actor} basePath="/coop/collections" />;
}
