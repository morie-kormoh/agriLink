import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@agripay/ui/components/badge";
import { PaymentsPage } from "@/components/trade/pages";
import { requirePortal } from "@/server/auth/actor";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requirePortal("/admin");
  const t = await getTranslations("nav");
  return (
    <>
      <div className="mb-2 flex gap-2">
        <Link href="/admin/payments/instructions">
          <Badge variant="outline">{t("instructions")} →</Badge>
        </Link>
        <Link href="/admin/reconciliation">
          <Badge variant="outline">{t("reconciliation")} →</Badge>
        </Link>
      </div>
      <PaymentsPage actor={actor} basePath="/admin/payments" searchParams={await searchParams} />
    </>
  );
}
