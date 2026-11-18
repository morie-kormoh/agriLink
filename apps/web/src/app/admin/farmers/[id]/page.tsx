import { FarmerProfile } from "@/components/farmers/farmer-profile";
import { requirePortal } from "@/server/auth/actor";
import { getFarmerOr404 } from "@/server/farmers/page-helpers";

export default async function AdminFarmerPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePortal("/admin");
  const farmer = await getFarmerOr404(actor, (await params).id);
  return (
    <FarmerProfile
      farmer={farmer}
      actor={actor}
      recordsHref={`/admin/farmers/${farmer.id}/records`}
    />
  );
}
