import { FarmerListPage } from "@/components/farmers/farmer-list-page";
import { requirePortal } from "@/server/auth/actor";

export default async function AdminFarmersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requirePortal("/admin");
  return (
    <FarmerListPage actor={actor} searchParams={await searchParams} basePath="/admin/farmers" />
  );
}
