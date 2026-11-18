import { LoansPage } from "@/components/finance/loans-page";
import { requirePortal } from "@/server/auth/actor";

export default async function Page() {
  const { actor } = await requirePortal("/farmer");
  return <LoansPage actor={actor} />;
}
