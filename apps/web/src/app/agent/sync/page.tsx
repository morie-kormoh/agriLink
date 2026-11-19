import { getTranslations } from "next-intl/server";
import { PageHeader } from "@agrilink/ui/components/blocks";
import { SyncPanel } from "@/components/offline/sync-panel";

export default async function AgentSyncPage() {
  const t = await getTranslations("sync");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <SyncPanel />
    </>
  );
}
