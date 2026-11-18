import { getTranslations } from "next-intl/server";
import { prisma } from "@agripay/db";
import { PageHeader } from "@agripay/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import { formatDateTime } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { ReconcileForm } from "./reconcile-form";

export default async function ReconciliationPage() {
  await requirePortal("/admin");
  const t = await getTranslations("payments");
  const runs = await prisma.reconciliationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return (
    <>
      <PageHeader title={t("reconTitle")} description={t("reconSubtitle")} />
      <ReconcileForm />
      <h2 className="mt-8 mb-3 font-semibold">History</h2>
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">{t("matched")}</TableHead>
              <TableHead className="text-right">{t("mismatched")}</TableHead>
              <TableHead className="text-right">{t("missing")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{formatDateTime(r.createdAt)}</TableCell>
                <TableCell>{r.provider}</TableCell>
                <TableCell className="text-xs">
                  {r.periodFrom.toISOString().slice(0, 10)} →{" "}
                  {r.periodTo.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell className="text-right">{r.matched}</TableCell>
                <TableCell className="text-right">{r.mismatched}</TableCell>
                <TableCell className="text-right">{r.missing}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
