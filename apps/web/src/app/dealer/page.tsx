import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BanknoteIcon, ClockIcon, TicketIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { PageHeader, StatCard, StatusBadge } from "@agripay/ui/components/blocks";
import { formatLe } from "@agripay/validation";
import { NeedProfile } from "@/components/dealer/dealer-client";
import { requirePortal } from "@/server/auth/actor";
import { dealerRedemptions } from "@/server/credit/dealers";
import { SettlementsTable } from "./settlements/table";

export default async function DealerHome() {
  const { actor, context } = await requirePortal("/dealer");
  const t = await getTranslations("dealer");
  if (actor.role !== "AGRO_DEALER") return <PageHeader title={t("title")} />;
  const r = await dealerRedemptions(actor);
  return (
    <>
      <PageHeader
        title={context.orgName ?? t("title")}
        description={r.dealer ? (r.dealer.verified ? t("verified") : t("notVerified")) : undefined}
        actions={
          r.dealer?.verified ? (
            <Button asChild size="lg">
              <Link href="/dealer/redeem">
                <TicketIcon /> {t("redeem")}
              </Link>
            </Button>
          ) : null
        }
      />
      {!r.dealer ? (
        <NeedProfile />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard
              label={t("redeemedTotal")}
              value={formatLe(r.totals.redeemedLe)}
              icon={TicketIcon}
            />
            <StatCard
              label={t("settled")}
              value={formatLe(r.totals.settledLe)}
              icon={BanknoteIcon}
            />
            <StatCard label={t("pending")} value={formatLe(r.totals.pendingLe)} icon={ClockIcon} />
          </div>
          {!r.dealer.verified ? <StatusBadge tone="warning">{t("notVerified")}</StatusBadge> : null}
          <SettlementsTable items={r.items.slice(0, 10)} />
        </>
      )}
    </>
  );
}
