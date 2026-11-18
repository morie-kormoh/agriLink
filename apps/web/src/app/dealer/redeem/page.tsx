import { getTranslations } from "next-intl/server";
import { PageHeader } from "@agripay/ui/components/blocks";
import { NeedProfile, RedeemFlow } from "@/components/dealer/dealer-client";
import { requirePortal } from "@/server/auth/actor";
import { dealerFor, listCatalogue } from "@/server/credit/dealers";

export default async function Page() {
  const { actor } = await requirePortal("/dealer");
  const t = await getTranslations("dealer");
  const dealer = actor.role === "AGRO_DEALER" ? await dealerFor(actor) : null;
  const items = dealer ? await listCatalogue(actor, { activeOnly: true }) : [];
  return (
    <>
      <PageHeader
        title={t("redeem")}
        description={dealer?.verified === false ? t("notVerified") : t("redeemSub")}
      />
      {dealer ? (
        <RedeemFlow
          catalogue={items.map((i) => ({
            id: i.id,
            name: i.name,
            category: i.category,
            unit: i.unit,
            unitPriceLe: i.unitPriceLe.toFixed(2),
          }))}
        />
      ) : (
        <NeedProfile />
      )}
    </>
  );
}
