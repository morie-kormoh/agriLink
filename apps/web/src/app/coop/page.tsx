import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserPlusIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { PageHeader } from "@agripay/ui/components/blocks";
import { StatsGrid } from "@/components/stats-grid";
import { TradeStats } from "@/components/trade/trade-stats";
import { platformStats } from "@/server/admin/service";
import { requirePortal } from "@/server/auth/actor";

export default async function CoopHome() {
  const { actor, context } = await requirePortal("/coop");
  const t = await getTranslations();
  const stats = await platformStats(actor);
  return (
    <>
      <PageHeader
        title={context.orgName ?? t("nav.dashboard")}
        description={t(`roles.${actor.role}`)}
        actions={
          <Button asChild>
            <Link href="/coop/members/new">
              <UserPlusIcon /> {t("nav.registerFarmer")}
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <TradeStats actor={actor} base="/coop" />
        <StatsGrid stats={stats} />
      </div>
    </>
  );
}
