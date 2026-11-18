import { getTranslations } from "next-intl/server";
import { PageHeader } from "@agripay/ui/components/blocks";
import { requirePortal } from "@/server/auth/actor";
import { listLoans } from "@/server/credit/loans";
import { LoansTable } from "../loans-table";

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { actor } = await requirePortal("/lender");
  const t = await getTranslations("nav");
  const { items } = await listLoans(actor, { page: Number((await searchParams).page ?? 1) || 1 });
  return (
    <>
      <PageHeader title={t("allLoans")} />
      <LoansTable items={items} />
    </>
  );
}
