import { FarmerProfile } from "@/components/farmers/farmer-profile";
import { requirePortal } from "@/server/auth/actor";
import { getFarmerOr404 } from "@/server/farmers/page-helpers";

export default async function CoopMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePortal("/coop");
  const farmer = await getFarmerOr404(actor, (await params).id);
  return (
    <FarmerProfile
      farmer={farmer}
      actor={actor}
      recordsHref={`/coop/members/${farmer.id}/records`}
      savingsHref={`/coop/members/${farmer.id}/savings`}
    />
  );
}
