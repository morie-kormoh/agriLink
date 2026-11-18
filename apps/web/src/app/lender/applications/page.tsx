import { getTranslations } from "next-intl/server";
import { PageHeader } from "@agripay/ui/components/blocks";
import { requirePortal } from "@/server/auth/actor";
import { listLoans } from "@/server/credit/loans";
import { LoansTable } from "../loans-table";

export default async function Page() {
  const { actor } = await requirePortal("/lender");
  const t = await getTranslations("lender");
  const { items } = await listLoans(actor, { queue: true });
  return (
    <>
      <PageHeader title={t("applications")} description={t("applicationsSub")} />
      <LoansTable items={items} decisions />
    </>
  );
}
