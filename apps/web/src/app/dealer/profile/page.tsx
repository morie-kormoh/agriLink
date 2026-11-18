import { getTranslations } from "next-intl/server";
import { prisma } from "@agripay/db";
import { Card, CardContent } from "@agripay/ui/components/card";
import { PageHeader, StatusBadge } from "@agripay/ui/components/blocks";
import { DealerProfileForm } from "@/components/dealer/dealer-client";
import { requirePortal } from "@/server/auth/actor";
import { dealerFor } from "@/server/credit/dealers";

export default async function Page() {
  const { actor } = await requirePortal("/dealer");
  const t = await getTranslations("dealer");
  const dealer = actor.role === "AGRO_DEALER" ? await dealerFor(actor) : null;
  const districts = await prisma.district.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <>
      <PageHeader
        title={t("profile")}
        actions={
          dealer ? (
            <StatusBadge tone={dealer.verified ? "success" : "warning"}>
              {dealer.verified ? t("verified") : t("notVerified")}
            </StatusBadge>
          ) : null
        }
      />
      <Card>
        <CardContent className="pt-6">
          <DealerProfileForm
            districts={districts}
            initial={{
              districtId: dealer?.districtId ?? districts[0]?.id ?? "",
              payoutMsisdn: dealer?.payoutMsisdn ?? "",
              payoutProvider: dealer?.payoutProvider ?? "ORANGE_MONEY",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
