import { FarmerListPage } from "@/components/farmers/farmer-list-page";
import { PendingList } from "@/components/farmers/pending-list";
import { requirePortal } from "@/server/auth/actor";

export default async function AgentFarmersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requirePortal("/agent");
  return (
    <FarmerListPage
      actor={actor}
      searchParams={await searchParams}
      basePath="/agent/farmers"
      newHref="/agent/farmers/new"
    >
      <PendingList />
    </FarmerListPage>
  );
}
