import { getTranslations } from "next-intl/server";
import { PageHeader } from "@agrilink/ui/components/blocks";
import { formatLe } from "@agrilink/validation";
import { requirePortal } from "@/server/auth/actor";
import { dealerRedemptions } from "@/server/credit/dealers";
import { SettlementsTable } from "./table";

export default async function Page() {
  const { actor } = await requirePortal("/dealer");
  const t = await getTranslations("dealer");
  const r = await dealerRedemptions(actor);
  return (
    <>
      <PageHeader
        title={t("settlements")}
        description={`${t("settled")}: ${formatLe(r.totals.settledLe)} · ${t("pending")}: ${formatLe(r.totals.pendingLe)}`}
      />
      <SettlementsTable items={r.items} />
    </>
  );
}
