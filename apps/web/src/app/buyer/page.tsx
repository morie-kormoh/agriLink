import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ScaleIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { PageHeader } from "@agrilink/ui/components/blocks";
import { TradeStats } from "@/components/trade/trade-stats";
import { requirePortal } from "@/server/auth/actor";

export default async function BuyerHome() {
  const { actor, context } = await requirePortal("/buyer");
  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={context.orgName ?? t("nav.dashboard")}
        description={t(`roles.${actor.role}`)}
        actions={
          <Button asChild>
            <Link href="/buyer/collections/new">
              <ScaleIcon /> {t("nav.recordPurchase")}
            </Link>
          </Button>
        }
      />
      <TradeStats actor={actor} base="/buyer" />
    </>
  );
}
