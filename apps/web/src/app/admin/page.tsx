import { getTranslations } from "next-intl/server";
import { Building2Icon, UserCogIcon } from "lucide-react";
import { PageHeader, StatCard } from "@agripay/ui/components/blocks";
import { StatsGrid } from "@/components/stats-grid";
import { platformStats } from "@/server/admin/service";
import { requirePortal } from "@/server/auth/actor";

export default async function AdminHome() {
  const { actor } = await requirePortal("/admin");
  const t = await getTranslations("admin");
  const stats = await platformStats(actor);
  return (
    <>
      <PageHeader title={t("dashboardTitle")} />
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <StatCard label={t("users")} value={stats.users.toLocaleString("en")} icon={UserCogIcon} />
        <StatCard
          label={t("organizations")}
          value={stats.orgs.toLocaleString("en")}
          icon={Building2Icon}
        />
      </div>
      <StatsGrid stats={stats} />
    </>
  );
}
