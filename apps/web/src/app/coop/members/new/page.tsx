import { getTranslations } from "next-intl/server";
import { PageHeader } from "@agrilink/ui/components/blocks";
import { RegisterWizard } from "@/components/farmers/register-wizard";
import { requirePortal } from "@/server/auth/actor";
import { getReferenceData } from "@/server/reference";

export default async function CoopRegisterPage() {
  const { actor, user } = await requirePortal("/coop");
  const t = await getTranslations("farmer");
  const reference = await getReferenceData(actor);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("registerTitle")} description={t("registerSubtitle")} />
      <RegisterWizard reference={reference} ownerUserId={user.id} profileBase="/coop/members" />
    </div>
  );
}
