import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, CheckCircle2Icon, ShieldAlertIcon } from "lucide-react";
import { prisma } from "@agrilink/db";
import { Badge } from "@agrilink/ui/components/badge";
import { EmptyState, Field, PageHeader } from "@agrilink/ui/components/blocks";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { SplitRibbon } from "@agrilink/ui/components/split-ribbon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatSlPhone } from "@agrilink/validation";
import { type Actor, hasPermission } from "@agrilink/validation/permissions";
import { Pagination } from "@/components/pagination";
import { formatDateTime, formatLe } from "@/lib/format";
import { getPayment, listPayments } from "@/server/payments/service";
import { listDisputes } from "@/server/trade/purchases";
import { getTradeSettings, listActivePrices, listCollectionPoints } from "@/server/trade/settings";
import { ResolveDispute } from "./disputes";
import { PricesManager } from "./prices-manager";
import { PurchaseForm } from "./purchase-form";
import { CollectionPointsManager, TradeSettingsForm } from "./settings-forms";
import { PaymentStatus } from "./status-badges";

const SPLIT_KINDS = [
  "LOAN_REPAYMENT",
  "SAVINGS",
  "COOP_DUES",
  "INSURANCE_PREMIUM",
  "DEALER_SETTLEMENT",
];
async function splitLabels() {
  const t = await getTranslations();
  return Object.fromEntries(SPLIT_KINDS.map((k) => [k, t(`splitShort.${k}`)]));
}

export async function RecordPurchasePage({
  actor,
  collectionsPath,
}: {
  actor: Actor;
  collectionsPath: string;
}) {
  const t = await getTranslations("trade");
  const [crops, prices, points, settings] = await Promise.all([
    prisma.crop.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listActivePrices(actor),
    listCollectionPoints(actor),
    getTradeSettings(actor),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("recordTitle")} description={t("recordSubtitle")} />
      <PurchaseForm
        crops={crops}
        prices={prices.map((p) => ({
          cropId: p.cropId,
          grade: p.grade,
          unit: p.unit,
          priceLe: p.priceLe.toFixed(2),
        }))}
        collectionPoints={points.map((p) => ({ id: p.id, name: p.name }))}
        isBuyer={settings.kind === "BUYER"}
        basePath={collectionsPath}
      />
    </div>
  );
}

export async function PricesPage({ actor }: { actor: Actor }) {
  const t = await getTranslations("trade");
  const [crops, prices] = await Promise.all([
    prisma.crop.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listActivePrices(actor),
  ]);
  return (
    <>
      <PageHeader title={t("pricesTitle")} description={t("pricesSubtitle")} />
      <PricesManager
        crops={crops}
        canManage={hasPermission(actor.role, "price.manage")}
        prices={prices.map((p) => ({
          id: p.id,
          crop: p.crop.name,
          cropId: p.cropId,
          grade: p.grade,
          unit: p.unit,
          priceLe: p.priceLe.toFixed(2),
          validFrom: p.validFrom.toISOString(),
        }))}
      />
    </>
  );
}

export async function DisputesPage({ actor }: { actor: Actor }) {
  const t = await getTranslations("trade");
  const disputes = await listDisputes(actor);
  return (
    <>
      <PageHeader title={t("disputesTitle")} description={t("disputesSubtitle")} />
      {disputes.length === 0 ? (
        <EmptyState icon={CheckCircle2Icon} title={t("noDisputes")} />
      ) : (
        <div className="space-y-3">
          {disputes.map((p) => (
            <Card key={p.id} className="gap-3 py-4">
              <CardContent className="space-y-3 px-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {p.farmer.fullName}{" "}
                      <span className="text-muted-foreground font-mono text-xs">
                        {p.farmer.agrilinkId}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {p.ref} · {p.quantity.toString()}
                      {p.unit} {p.crop.name} · {formatLe(p.netLe.toString())} ·{" "}
                      {formatSlPhone(p.farmer.phone)}
                    </p>
                  </div>
                  <Badge variant="destructive">
                    <ShieldAlertIcon /> {formatDateTime(p.disputedAt)}
                  </Badge>
                </div>
                <p className="bg-secondary/50 rounded-md p-2 text-sm">“{p.disputeReason}”</p>
                <ResolveDispute purchaseId={p.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export async function TradeSettingsPage({ actor }: { actor: Actor }) {
  const [s, points] = await Promise.all([
    getTradeSettings(actor),
    listCollectionPoints(actor, true),
  ]);
  const canManage = hasPermission(actor.role, "tradeSettings.manage");
  const src = s.coop ?? s.buyer!;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={s.org.name} />
      <TradeSettingsForm
        kind={s.kind}
        canManage={canManage}
        initial={{
          approvalThresholdLe: src.approvalThresholdLe?.toFixed(2) ?? "",
          fundingProvider: src.fundingProvider ?? "",
          fundingAccount: src.fundingAccount ?? "",
          ...(s.coop
            ? {
                duesPct: s.coop.duesPct?.toString() ?? "",
                duesFlatLe: s.coop.duesFlatLe?.toFixed(2) ?? "",
                registrationNo: s.coop.registrationNo ?? "",
              }
            : { type: s.buyer?.type }),
        }}
      />
      <CollectionPointsManager
        canManage={canManage}
        points={points.map((p) => ({
          id: p.id,
          name: p.name,
          community: p.community,
          active: p.active,
        }))}
      />
    </div>
  );
}

export async function PaymentsPage({
  actor,
  basePath,
  searchParams,
}: {
  actor: Actor;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const t = await getTranslations();
  const shortLabels = await splitLabels();
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;
  const r = await listPayments(actor, { page, status });
  return (
    <>
      <PageHeader title={t("payments.title")} description={`${r.total.toLocaleString("en")}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {["", "SUCCESS", "PROCESSING", "PENDING", "PARTIAL", "FAILED"].map((s) => (
          <Link key={s} href={s ? `${basePath}?status=${s}` : basePath}>
            <Badge variant={(status ?? "") === s ? "default" : "outline"}>
              {s ? t(`paymentStatus.${s}`) : "All"}
            </Badge>
          </Link>
        ))}
      </div>
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("payments.ref")}</TableHead>
              <TableHead>{t("payments.date")}</TableHead>
              <TableHead>{t("payments.farmer")}</TableHead>
              <TableHead className="text-right">{t("payments.amount")}</TableHead>
              <TableHead>{t("payments.splits")}</TableHead>
              <TableHead>{t("payments.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground h-20 text-center">
                  {t("payments.noPayments")}
                </TableCell>
              </TableRow>
            ) : (
              r.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      className="text-primary font-mono text-xs font-semibold underline"
                      href={`${basePath}/${p.id}`}
                    >
                      {p.ref}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(p.createdAt)}</TableCell>
                  <TableCell>
                    {p.purchase?.farmer.fullName ?? "—"}
                    <p className="text-muted-foreground text-xs">
                      {p.purchase ? `${p.purchase.ref} · ${p.purchase.crop.name}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(p.grossLe.toString())}
                  </TableCell>
                  <TableCell className="min-w-56">
                    <SplitRibbon
                      size="sm"
                      grossLe={p.grossLe.toString()}
                      splits={p.splits.map((s) => ({
                        type: s.type,
                        amountLe: s.amountLe.toString(),
                      }))}
                      labels={shortLabels}
                      farmerLabel={
                        p.purchase?.farmer.fullName.split(" ")[0] ?? t("splitShort.FARMER_WALLET")
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <PaymentStatus status={p.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={r.page}
        pages={r.pages}
        total={r.total}
        searchParams={searchParams}
        basePath={basePath}
      />
    </>
  );
}

export async function PaymentDetailPage({
  actor,
  id,
  backPath,
}: {
  actor: Actor;
  id: string;
  backPath: string;
}) {
  const t = await getTranslations();
  const p = await getPayment(actor, id);
  return (
    <>
      <Link
        href={backPath}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {t("payments.title")}
      </Link>
      <PageHeader
        title={`${t("payments.ref")} ${p.ref}`}
        description={formatDateTime(p.createdAt)}
        actions={<PaymentStatus status={p.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("trade.purchases")}</CardTitle>
          </CardHeader>
          <CardContent>
            {p.purchase ? (
              <dl className="grid gap-3">
                <Field label="Ref">{p.purchase.ref}</Field>
                <Field label={t("trade.farmer")}>
                  {p.purchase.farmer.fullName} · {p.purchase.farmer.agrilinkId}
                </Field>
                <Field label={t("trade.crop")}>
                  {p.purchase.quantity.toString()} {p.purchase.unit} {p.purchase.crop.name}
                </Field>
                <Field label={t("trade.gross")}>{formatLe(p.purchase.grossLe.toString())}</Field>
                <Field label={t("trade.deductions")}>
                  {formatLe(p.purchase.deductionsLe.toString())}
                </Field>
                <Field label={t("trade.net")}>{formatLe(p.purchase.netLe.toString())}</Field>
              </dl>
            ) : null}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("trade.preview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SplitRibbon
              className="mb-5"
              size="lg"
              grossLe={p.grossLe.toString()}
              splits={p.splits.map((s) => ({ type: s.type, amountLe: s.amountLe.toString() }))}
              labels={await splitLabels()}
              farmerLabel={p.purchase?.farmer.fullName ?? t("splitShort.FARMER_WALLET")}
            />
            <ul className="space-y-3">
              {p.splits.map((s) => (
                <li key={s.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {s.order}. {t(`splitType.${s.type}`)} · {formatLe(s.amountLe.toString())}
                    </p>
                    <PaymentStatus status={s.status} />
                  </div>
                  {s.instructions.map((i) => (
                    <p key={i.id} className="text-muted-foreground mt-1 font-mono text-xs">
                      {i.provider} · {i.fromAccount} → {i.toAccount} · {t("payments.attempts")}:{" "}
                      {i.attempts}
                      {i.providerRef ? ` · ${i.providerRef}` : ""}
                      {i.lastError ? (
                        <span className="text-destructive block">{i.lastError}</span>
                      ) : null}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
