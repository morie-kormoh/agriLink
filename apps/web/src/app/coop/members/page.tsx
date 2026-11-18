import { getTranslations } from "next-intl/server";
import { FarmerListPage } from "@/components/farmers/farmer-list-page";
import { requirePortal } from "@/server/auth/actor";

export default async function CoopMembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requirePortal("/coop");
  const t = await getTranslations("nav");
  return (
    <FarmerListPage
      actor={actor}
      searchParams={await searchParams}
      basePath="/coop/members"
      newHref="/coop/members/new"
      title={t("members")}
    />
  );
}
