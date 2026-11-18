import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@agripay/ui/components/blocks";
import { RegisterWizard } from "@/components/farmers/register-wizard";
import { requirePortal } from "@/server/auth/actor";
import { getReferenceData } from "@/server/reference";

export const metadata: Metadata = { title: "Register farmer" };

export default async function AgentRegisterPage() {
  const { actor, user } = await requirePortal("/agent");
  const t = await getTranslations("farmer");
  const reference = await getReferenceData(actor);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("registerTitle")} description={t("registerSubtitle")} />
      <RegisterWizard reference={reference} ownerUserId={user.id} profileBase="/agent/farmers" />
    </div>
  );
}
