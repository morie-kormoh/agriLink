import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, KeyRoundIcon, PiggyBankIcon, UsersIcon } from "lucide-react";
import { prisma } from "@agrilink/db";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { EmptyState, PageHeader, StatCard } from "@agrilink/ui/components/blocks";
import { MoneyCard, MoneyFigure } from "@agrilink/ui/components/money";
import { Alert, AlertDescription, AlertTitle } from "@agrilink/ui/components/misc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { currentSeason, formatLe } from "@agrilink/validation";
import type { Actor } from "@agrilink/validation/permissions";
import { isMvpMode } from "@/server/demo/flags";
import { getSavingsSummary } from "@/server/savings/service";
import { AccountCard, type AccountView, OpenSavings, type ProductView } from "./savings-client";

/** Savings for one farmer — the farmer's own page, or an agent helping them (farmer's PIN still required). */
export async function SavingsPage({
  actor,
  farmerId,
  backHref,
}: {
  actor: Actor;
  farmerId: string;
  backHref?: string;
}) {
  const t = await getTranslations();
  const s = await getSavingsSummary(actor, farmerId);
  const user = s.farmer.userId
    ? await prisma.user.findUnique({ where: { id: s.farmer.userId }, select: { pinHash: true } })
    : null;
  const assisted = actor.role !== "FARMER";
  const season = currentSeason();
  const accounts: AccountView[] = s.accounts.map((a) => ({
    id: a.id,
    ref: a.ref,
    type: a.product.type,
    productName: a.product.name,
    custodian: a.product.custodian.name,
    status: a.status,
    balanceLe: a.balanceLe.toFixed(2),
    availableLe: a.availableLe,
    pct: a.autoSavePct ? Number(a.autoSavePct) : null,
    paused: a.autoSavePaused,
    goalLe: a.goalLe?.toFixed(2) ?? null,
    goalLabel: a.goalLabel,
    lockedUntil: a.lockedUntil?.toISOString() ?? null,
    minPct: Number(a.product.minPct ?? 1),
    maxPct: Number(a.product.maxPct ?? 50),
    earlyAllowed: a.product.earlyWithdrawalAllowed && a.balanceLe.gt(0),
    earlyFeePct: a.product.earlyWithdrawalFeePct?.toString() ?? null,
    earlyUsed: a.earlyWithdrawalSeason === season,
    interestNote: a.product.interestNote,
  }));
  const openProductIds = new Set(
    s.accounts.filter((a) => a.status === "ACTIVE").map((a) => a.productId),
  );
  const products: ProductView[] = s.products
    .filter(
      (p) => !openProductIds.has(p.id) && p.type !== "GROUP" && !(isMvpMode() && p.type === "GOAL"),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      custodian: p.custodian.name,
      defaultPct: Number(p.defaultPct ?? p.minPct ?? 10),
      minPct: Number(p.minPct ?? 1),
      maxPct: Number(p.maxPct ?? 50),
      releaseMonthDay: p.releaseMonthDay,
      interestNote: p.interestNote,
    }));
  const history = s.accounts
    .flatMap((a) => a.transactions.map((tx) => ({ ...tx, ref: a.ref })))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 30);

  return (
    <>
      {backHref ? (
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> {s.farmer.fullName}
        </Link>
      ) : null}
      <PageHeader
        title={t("savings.title")}
        description={
          assisted ? `${s.farmer.fullName} · ${s.farmer.agrilinkId}` : t("savings.subtitle")
        }
      />
      {!user?.pinHash ? (
        <Alert variant="warning" className="mb-6">
          <KeyRoundIcon />
          <AlertTitle>{t("finance.noPinTitle")}</AlertTitle>
          <AlertDescription>
            <p>{t("finance.noPinBody")}</p>
            {!assisted ? (
              <Button asChild size="sm" className="mt-2">
                <Link href="/settings/security">{t("finance.setPin")}</Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <MoneyCard tone="gold" className="sm:col-span-1">
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <PiggyBankIcon className="size-4 text-[#9a6a00]" aria-hidden />{" "}
            {t("savings.totalSaved")}
          </p>
          <MoneyFigure amountLe={s.totalSavedLe} size="lg" className="mt-1" />
        </MoneyCard>
        <StatCard label={t("savings.groups")} value={s.groups.length} icon={UsersIcon} />
        <StatCard
          label={t("savings.unlocks", { date: "" }).trim()}
          value={(() => {
            const next = accounts
              .filter((a) => a.lockedUntil)
              .sort((a, b) => a.lockedUntil!.localeCompare(b.lockedUntil!))[0];
            return next
              ? new Date(next.lockedUntil!).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })
              : "—";
          })()}
        />
      </div>

      <div className="space-y-6">
        {accounts.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {accounts.map((a) => (
              <AccountCard key={a.id} a={a} assisted={assisted} />
            ))}
          </div>
        ) : null}
        {products.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              {accounts.length ? t("savings.openGoal") : t("savings.openLock")}
            </h2>
            <OpenSavings farmerId={farmerId} products={products} assisted={assisted} />
          </section>
        ) : !accounts.length ? (
          <EmptyState icon={PiggyBankIcon} title={t("savings.noProducts")} />
        ) : null}

        {s.groups.length ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("savings.groups")}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {s.groups.map((g) => (
                <div key={g.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{g.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {t(`groups.types.${g.type}` as never)} ·{" "}
                      {t(`groups.roles.${g.role}` as never)}
                      {g.payoutOrder ? ` · ${t("groups.payoutOrder")} ${g.payoutOrder}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatLe(g.myTotalLe)}</p>
                    <p className="text-muted-foreground text-xs">{t("savings.myTotal")}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("savings.history")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("records.date")}</TableHead>
                  <TableHead>{t("savings.ref")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">Le</TableHead>
                  <TableHead className="text-right">{t("savings.balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground h-16 text-center">
                      {t("savings.noHistory")}
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => {
                    const out =
                      h.type !== "CREDIT_AUTO" &&
                      h.type !== "CREDIT_MANUAL" &&
                      h.type !== "INTEREST";
                    return (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs">
                          {h.createdAt.toLocaleDateString("en-GB")}
                        </TableCell>
                        <TableCell className="text-xs">{h.ref}</TableCell>
                        <TableCell>{t(`savingsTxn.${h.type}` as never)}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${out ? "text-destructive" : "text-emerald-700"}`}
                        >
                          {out ? "−" : "+"}
                          {formatLe(h.amountLe.toFixed(2))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatLe(h.balanceAfterLe.toFixed(2))}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
