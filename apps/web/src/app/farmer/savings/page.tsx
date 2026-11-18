import { SavingsPage } from "@/components/finance/savings-page";
import { requirePortal } from "@/server/auth/actor";

export default async function Page() {
  const { actor } = await requirePortal("/farmer");
  return <SavingsPage actor={actor} farmerId={actor.farmerId ?? ""} />;
}
