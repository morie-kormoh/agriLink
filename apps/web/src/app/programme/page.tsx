import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/coming-soon";

export default async function Page() {
  const t = await getTranslations();
  return <ComingSoon title={t("programme.title")} module="11 (Programme & Analytics)" />;
}
