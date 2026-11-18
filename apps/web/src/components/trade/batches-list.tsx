import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PackageIcon, ScaleIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { EmptyState, PageHeader } from "@agripay/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import type { Actor } from "@agripay/validation/permissions";
import { formatDateTime, formatLe } from "@/lib/format";
import { listBatches } from "@/server/trade/batches";
import { BatchStatus } from "./status-badges";

export async function BatchesList({ actor, basePath }: { actor: Actor; basePath: string }) {
  const t = await getTranslations();
  const batches = await listBatches(actor, { take: 100 });
  return (
    <>
      <PageHeader
        title={t("nav.collections")}
        actions={
          <Button asChild>
            <Link href={`${basePath}/new`}>
              <ScaleIcon /> {t("nav.recordPurchase")}
            </Link>
          </Button>
        }
      />
      {batches.length === 0 ? (
        <EmptyState icon={PackageIcon} title={t("common.noResults")} />
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("trade.batch")}</TableHead>
                <TableHead>{t("payments.date")}</TableHead>
                <TableHead>{t("trade.collectionPoint")}</TableHead>
                <TableHead>{t("trade.createdBy")}</TableHead>
                <TableHead className="text-right">{t("trade.purchases")}</TableHead>
                <TableHead className="text-right">{t("trade.total")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link
                      className="text-primary font-mono text-xs font-semibold underline"
                      href={`${basePath}/${b.id}`}
                    >
                      {b.ref}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(b.createdAt)}</TableCell>
                  <TableCell>{b.collectionPoint?.name ?? "—"}</TableCell>
                  <TableCell>{b.createdByName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(b.totalNetLe)}
                  </TableCell>
                  <TableCell>
                    <BatchStatus status={b.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
