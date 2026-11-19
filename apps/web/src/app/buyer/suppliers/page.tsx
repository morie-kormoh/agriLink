import { getTranslations } from "next-intl/server";
import { DownloadIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { PageHeader } from "@agrilink/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatDate, formatLe } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { supplierReport } from "@/server/trade/batches";

export default async function SuppliersPage() {
  const { actor } = await requirePortal("/buyer");
  const t = await getTranslations();
  const rows = await supplierReport(actor);
  return (
    <>
      <PageHeader
        title={t("trade.suppliersTitle")}
        description={t("trade.suppliersSubtitle")}
        actions={
          <Button variant="outline" asChild>
            <a href="/api/trade/suppliers.csv">
              <DownloadIcon /> {t("farmer.export")}
            </a>
          </Button>
        }
      />
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("farmer.agrilinkId")}</TableHead>
              <TableHead>{t("farmer.name")}</TableHead>
              <TableHead>{t("farmer.location")}</TableHead>
              <TableHead>{t("trade.crop")}</TableHead>
              <TableHead className="text-right">{t("trade.purchases")}</TableHead>
              <TableHead className="text-right">{t("trade.quantity")}</TableHead>
              <TableHead className="text-right">{t("trade.total")}</TableHead>
              <TableHead>Last</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground h-20 text-center">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={`${r.farmerId}:${r.crop}:${r.unit}`}>
                  <TableCell className="font-mono text-xs">{r.agrilinkId}</TableCell>
                  <TableCell>{r.fullName}</TableCell>
                  <TableCell className="text-xs">
                    {r.community}, {r.chiefdom}, {r.district}
                  </TableCell>
                  <TableCell>{r.crop}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.purchases}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.quantity).toLocaleString("en")} {r.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatLe(r.netLe)}</TableCell>
                  <TableCell className="text-xs">{formatDate(r.lastPurchase)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
