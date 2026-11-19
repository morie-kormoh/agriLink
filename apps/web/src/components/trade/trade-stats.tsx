import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BanknoteIcon, ClockIcon, ScaleIcon, ShieldAlertIcon, UsersIcon } from "lucide-react";
import { StatCard } from "@agrilink/ui/components/blocks";
import type { Actor } from "@agrilink/validation/permissions";
import { formatLe } from "@/lib/format";
import { tradeStats } from "@/server/trade/stats";

export async function TradeStats({ actor, base }: { actor: Actor; base: string }) {
  const t = await getTranslations();
  const s = await tradeStats(actor);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        label={`${t("trade.purchases")} · 30d`}
        value={s.purchases30}
        hint={formatLe(s.value30Le)}
        icon={ScaleIcon}
      />
      <StatCard
        label={t("trade.paidToFarmers")}
        value={formatLe(s.paidToFarmersLe)}
        hint={`${s.farmersPaid} ${t("admin.farmers").toLowerCase()}`}
        icon={BanknoteIcon}
      />
      <Link href={`${base}/collections`} className="min-h-0">
        <StatCard
          label={t("purchaseStatus.RECORDED")}
          value={s.waitingApproval}
          icon={ClockIcon}
          className="hover:border-primary"
        />
      </Link>
      <Link href={`${base}/disputes`} className="min-h-0">
        <StatCard
          label={t("nav.disputes")}
          value={s.openDisputes}
          icon={ShieldAlertIcon}
          className={
            s.openDisputes
              ? "border-destructive/50 hover:border-destructive"
              : "hover:border-primary"
          }
        />
      </Link>
      <Link href={`${base}/payments?status=FAILED`} className="min-h-0">
        <StatCard
          label={t("paymentStatus.FAILED")}
          value={s.failedPayments}
          icon={UsersIcon}
          className="hover:border-primary"
        />
      </Link>
    </div>
  );
}
