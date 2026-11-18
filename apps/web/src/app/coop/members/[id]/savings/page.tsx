import { SavingsPage } from "@/components/finance/savings-page";
import { requirePortal } from "@/server/auth/actor";
import { getFarmerOr404 } from "@/server/farmers/page-helpers";

/** Agent-assisted savings: the farmer confirms everything with their own PIN. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePortal("/coop");
  const { id } = await params;
  await getFarmerOr404(actor, id);
  return <SavingsPage actor={actor} farmerId={id} backHref={`/coop/members/${id}`} />;
}
