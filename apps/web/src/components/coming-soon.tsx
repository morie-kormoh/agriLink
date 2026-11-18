import { getTranslations } from "next-intl/server";
import { ConstructionIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@agripay/ui/components/blocks";

export async function ComingSoon({ title, module }: { title: string; module: string }) {
  const t = await getTranslations("common");
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={ConstructionIcon}
        title={t("comingSoon")}
        description={t("comingSoonBody", { module })}
      />
    </>
  );
}
