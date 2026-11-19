import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@agrilink/ui/components/card";
import { PageHeader } from "@agrilink/ui/components/blocks";
import { InstitutionForm } from "@/components/lender/lender-client";
import { requirePortal } from "@/server/auth/actor";
import { getInstitution } from "@/server/finance/common";

export default async function Page() {
  const { actor } = await requirePortal("/lender");
  const t = await getTranslations("lender");
  const { org, fi } = await getInstitution(actor);
  return (
    <>
      <PageHeader title={t("settings")} description={org.name} />
      <Card>
        <CardContent className="pt-6">
          <InstitutionForm
            initial={{
              licenceNo: fi?.licenceNo ?? "",
              fundingProvider: fi?.fundingProvider ?? "ORANGE_MONEY",
              fundingAccount: fi?.fundingAccount ?? "",
              collectionAccount: fi?.collectionAccount ?? "",
              savingsAccount: fi?.savingsAccount ?? "",
              approvalThresholdLe: fi?.approvalThresholdLe.toFixed(2) ?? "5000",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
