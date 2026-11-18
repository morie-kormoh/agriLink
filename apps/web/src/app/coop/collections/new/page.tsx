import { RecordPurchasePage } from "@/components/trade/pages";
import { requirePortal } from "@/server/auth/actor";

export default async function Page() {
  const { actor } = await requirePortal("/coop");
  return <RecordPurchasePage actor={actor} collectionsPath="/coop/collections" />;
}
