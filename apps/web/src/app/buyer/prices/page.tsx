import { PricesPage } from "@/components/trade/pages";
import { requirePortal } from "@/server/auth/actor";

export default async function Page() {
  const { actor } = await requirePortal("/buyer");
  return <PricesPage actor={actor} />;
}
