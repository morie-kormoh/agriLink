import { RecordsPage } from "@/components/records/records-page";
import { requirePortal } from "@/server/auth/actor";

export default async function FarmerRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { actor } = await requirePortal("/farmer");
  return (
    <RecordsPage
      actor={actor}
      farmerId={actor.farmerId ?? ""}
      season={(await searchParams).season}
    />
  );
}
