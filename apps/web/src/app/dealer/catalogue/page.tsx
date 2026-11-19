import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { PageHeader } from "@agrilink/ui/components/blocks";
import { CatalogueForm, NeedProfile } from "@/components/dealer/dealer-client";
import { requirePortal } from "@/server/auth/actor";
import { dealerFor, listCatalogue } from "@/server/credit/dealers";

export default async function Page() {
  const { actor } = await requirePortal("/dealer");
  const t = await getTranslations("dealer");
  const dealer = actor.role === "AGRO_DEALER" ? await dealerFor(actor) : null;
  if (!dealer) return <NeedProfile />;
  const items = await listCatalogue(actor);
  return (
    <>
      <PageHeader title={t("catalogue")} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("addItem")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CatalogueForm />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6">
            {items.map((i) => (
              <CatalogueForm
                key={i.id}
                item={{
                  id: i.id,
                  name: i.name,
                  category: i.category,
                  unit: i.unit,
                  unitPriceLe: i.unitPriceLe.toFixed(2),
                  active: i.active,
                }}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
