import { RecordsPage } from "@/components/records/records-page";
import { requirePortal } from "@/server/auth/actor";
import { getFarmerOr404 } from "@/server/farmers/page-helpers";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { actor } = await requirePortal("/agent");
  const { id } = await params;
  const farmer = await getFarmerOr404(actor, id);
  return (
    <RecordsPage
      actor={actor}
      farmerId={id}
      season={(await searchParams).season}
      backHref={`/agent/farmers/${id}`}
      title={farmer.fullName}
    />
  );
}
