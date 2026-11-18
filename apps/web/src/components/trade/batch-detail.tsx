import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, CheckCircle2Icon, ClockIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { PageHeader, StatCard } from "@agripay/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import { hasPermission, type Actor } from "@agripay/validation/permissions";
import { formatDateTime, formatLe } from "@/lib/format";
import { getBatch } from "@/server/trade/batches";
import { ApproveBatchButton, PurchaseRowActions, SubmitBatchButton } from "./batch-actions";
import { PaymentStatus, PurchaseStatus } from "./status-badges";

export async function BatchDetail({
  actor,
  id,
  basePath,
  paymentsPath,
}: {
  actor: Actor;
  id: string;
  basePath: string;
  paymentsPath: string;
}) {
  const t = await getTranslations();
  const batch = await getBatch(actor, id);
  const live = batch.purchases.filter((p) => p.status !== "CANCELLED");
  const total = live.reduce((s, p) => s + Number(p.netLe), 0);
  const waiting = live.filter((p) => p.status === "RECORDED");
  const isMaker = batch.createdById === actor.userId || batch.submittedById === actor.userId;
  const canApprove =
    hasPermission(actor.role, "payment.approve") && !isMaker && batch.status === "SUBMITTED";

  return (
    <>
      <Link
        href={basePath}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {t("nav.collections")}
      </Link>
      <PageHeader
        title={`${t("trade.batch")} ${batch.ref}`}
        description={`${formatDateTime(batch.createdAt)}${batch.collectionPoint ? ` · ${batch.collectionPoint.name}` : ""} · ${t("trade.createdBy")}: ${batch.names[batch.createdById] ?? "—"}`}
        actions={
          <>
            {batch.status === "OPEN" && hasPermission(actor.role, "purchase.create") ? (
              <>
                <Button variant="outline" asChild>
                  <Link href={`${basePath}/new`}>{t("nav.recordPurchase")}</Link>
                </Button>
                <SubmitBatchButton batchId={batch.id} disabled={live.length === 0} />
              </>
            ) : null}
            {canApprove ? (
              <ApproveBatchButton
                batchId={batch.id}
                count={waiting.length}
                total={formatLe(waiting.reduce((s, p) => s + Number(p.netLe), 0))}
              />
            ) : null}
          </>
        }
      />
      {batch.status === "SUBMITTED" && isMaker && hasPermission(actor.role, "payment.approve") ? (
        <p className="text-muted-foreground mb-4 text-sm">{t("trade.makerNote")}</p>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("trade.purchases")} value={live.length} />
        <StatCard label={t("trade.total")} value={formatLe(total)} />
        <StatCard
          label={t("common.status")}
          value={
            batch.status === "APPROVED" ? (
              <CheckCircle2Icon className="text-success size-6" />
            ) : (
              <ClockIcon className="text-warning size-6" />
            )
          }
          hint={t(`batchStatus.${batch.status}`)}
        />
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>{t("trade.farmer")}</TableHead>
              <TableHead>{t("trade.crop")}</TableHead>
              <TableHead className="text-right">{t("trade.quantity")}</TableHead>
              <TableHead className="text-right">{t("trade.net")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("payments.title")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batch.purchases.map((p) => (
              <TableRow key={p.id} className={p.status === "CANCELLED" ? "opacity-50" : undefined}>
                <TableCell className="font-mono text-xs">{p.ref}</TableCell>
                <TableCell>
                  <p className="font-medium">{p.farmer.fullName}</p>
                  <p className="text-muted-foreground text-xs">
                    {p.farmer.agripayId}
                    {p.farmerAcknowledgedAt ? ` · ✓ ${t("trade.farmerAck")}` : ""}
                  </p>
                </TableCell>
                <TableCell>
                  {p.crop.name}
                  {p.grade ? ` · ${p.grade}` : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.quantity.toString()} {p.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatLe(p.netLe.toString())}
                  {p.priceOverrideReason ? (
                    <p className="text-warning text-xs">{p.priceOverrideReason}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <PurchaseStatus status={p.status} />
                </TableCell>
                <TableCell>
                  {p.payment ? (
                    <Link
                      href={`${paymentsPath}/${p.payment.id}`}
                      className="inline-flex items-center gap-2"
                    >
                      <PaymentStatus status={p.payment.status} />
                      <span className="font-mono text-xs underline">{p.payment.ref}</span>
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <PurchaseRowActions
                    purchaseId={p.id}
                    canApprove={
                      p.status === "RECORDED" &&
                      batch.status === "SUBMITTED" &&
                      hasPermission(actor.role, "payment.approve") &&
                      p.recordedById !== actor.userId &&
                      batch.createdById !== actor.userId
                    }
                    canCancel={
                      (p.status === "RECORDED" || p.status === "DISPUTED") &&
                      (hasPermission(actor.role, "payment.approve") ||
                        p.recordedById === actor.userId)
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
