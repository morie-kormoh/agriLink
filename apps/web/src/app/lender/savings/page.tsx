import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agripay/ui/components/card";
import { PageHeader, StatCard, StatusBadge } from "@agripay/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import { formatLe } from "@agripay/validation";
import { hasPermission } from "@agripay/validation/permissions";
import {
  ReconcileSavingsForm,
  SavingsProductForm,
  ToggleSavingsProduct,
} from "@/components/lender/lender-client";
import { requirePortal } from "@/server/auth/actor";
import { custodianAccounts, listSavingsProducts } from "@/server/savings/service";

export default async function Page() {
  const { actor } = await requirePortal("/lender");
  const t = await getTranslations();
  const [products, accounts] = await Promise.all([
    listSavingsProducts(actor, { mine: true }),
    custodianAccounts(actor),
  ]);
  const canManage = hasPermission(actor.role, "savingsProduct.manage");
  return (
    <>
      <PageHeader title={t("lender.custodian")} description={t("lender.custodianSub")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("savings.totalSaved")} value={formatLe(accounts.totalLe)} />
        <StatCard label={t("savings.ref")} value={accounts.rows.length} />
        <StatCard
          label={t("lender.mirror")}
          value={accounts.mismatches === 0 ? "✓" : accounts.mismatches}
        />
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("lender.savingsProducts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y text-sm">
              {products.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <b>{p.name}</b> · {t(`savingsType.${p.type}`)} · {p.minPct?.toString()}–
                    {p.maxPct?.toString()}% · {p.releaseMonthDay ?? "—"} · {p._count.accounts}{" "}
                    {t("savings.ref").toLowerCase()}
                  </span>
                  {canManage ? <ToggleSavingsProduct id={p.id} active={p.active} /> : null}
                </div>
              ))}
            </div>
            {canManage ? (
              <>
                <h3 className="text-sm font-semibold">{t("lender.newSavingsProduct")}</h3>
                <SavingsProductForm />
              </>
            ) : null}
          </CardContent>
        </Card>
        <div className="bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("savings.ref")}</TableHead>
                <TableHead>{t("lender.farmer")}</TableHead>
                <TableHead>{t("lender.product")}</TableHead>
                <TableHead className="text-right">{t("savings.balance")}</TableHead>
                <TableHead>{t("lender.mirror")}</TableHead>
                <TableHead>{t("savings.unlocks", { date: "" }).trim()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.ref}</TableCell>
                  <TableCell>
                    {a.farmer?.fullName}
                    <p className="text-muted-foreground text-xs">{a.farmer?.agripayId}</p>
                  </TableCell>
                  <TableCell>{a.product.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(a.balanceLe.toFixed(2))}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={a.mirrorOk ? "success" : "destructive"}>
                      {a.mirrorOk ? "✓" : `${formatLe(a.ledgerLe)}`}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.lockedUntil?.toLocaleDateString("en-GB") ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("lender.reconcile")}</CardTitle>
            <CardDescription>{t("lender.custodianSub")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ReconcileSavingsForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
