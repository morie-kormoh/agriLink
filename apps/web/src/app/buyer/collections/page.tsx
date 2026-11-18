import { BatchesList } from "@/components/trade/batches-list";
import { requirePortal } from "@/server/auth/actor";

export default async function Page() {
  const { actor } = await requirePortal("/buyer");
  return <BatchesList actor={actor} basePath="/buyer/collections" />;
}
