import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@agripay/db";
import { Card, CardContent, CardHeader, CardTitle } from "@agripay/ui/components/card";
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
import { AddMemberForm, ContributionForm, GroupActions } from "@/components/finance/groups-client";
import { toneFor } from "@/components/finance/score-dial";
import { requirePortal } from "@/server/auth/actor";
import { notFoundOn404 } from "@/server/page-helpers";
import { getGroup } from "@/server/savings/groups";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePortal("/coop");
  const t = await getTranslations();
  const { id } = await params;
  const g = await notFoundOn404(() => getGroup(actor, id));
  const canManage = hasPermission(actor.role, "group.manage");
  const memberIds = new Set(g.members.map((m) => m.farmerId));
  const candidates = canManage
    ? await prisma.farmer.findMany({
        where: { cooperativeId: g.group.cooperativeId, status: "ACTIVE" },
        orderBy: { fullName: "asc" },
        take: 500,
        select: { id: true, fullName: true, agripayId: true },
      })
    : [];
  const shownPeriods = Array.from(
    { length: Math.min(g.periods, Math.max(g.currentPeriod, 1) + 1) },
    (_, i) => i + 1,
  ).slice(-8);
  return (
    <>
      <Link
        href="/coop/groups"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {t("groups.title")}
      </Link>
      <PageHeader
        title={g.group.name}
        description={`${g.group.ref} · ${t(`groups.types.${g.group.type}` as never)} · ${formatLe(g.group.contributionLe.toFixed(2))} ${t(`groups.${g.group.frequency}` as never).toLowerCase()}`}
        actions={
          <GroupActions
            groupId={g.group.id}
            payoutPeriod={
              g.nextPayout && g.nextPayout.periodNo <= g.currentPeriod
                ? g.nextPayout.periodNo
                : null
            }
          />
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label={t("groups.members")} value={g.members.length} />
        <StatCard
          label={t("groups.period")}
          value={t("groups.periodOf", { n: g.currentPeriod, total: g.periods })}
        />
        <StatCard label={t("groups.total")} value={formatLe(g.totalLe)} />
        <StatCard
          label={t("groups.paidOut")}
          value={formatLe(g.paidOutLe)}
          hint={
            g.nextPayout
              ? t("groups.nextPayout", { n: g.nextPayout.periodNo, name: g.nextPayout.name })
              : undefined
          }
        />
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("groups.record")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ContributionForm
              groupId={g.group.id}
              members={g.members.map((m) => ({ id: m.farmerId, label: m.farmer.fullName }))}
              defaultAmount={g.group.contributionLe.toFixed(2)}
              currentPeriod={g.currentPeriod}
              periods={g.periods}
            />
            {g.members.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("groups.noMembers")}</p>
            ) : null}
          </CardContent>
        </Card>
        <div className="bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("groups.members")}</TableHead>
                <TableHead>{t("groups.role")}</TableHead>
                {shownPeriods.map((p) => (
                  <TableHead key={p} className="text-right">
                    {p}
                  </TableHead>
                ))}
                <TableHead className="text-right">{t("groups.total")}</TableHead>
                <TableHead className="text-right">{t("groups.onTime")}</TableHead>
                <TableHead>{t("groups.loans")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <p className="font-medium">{m.farmer.fullName}</p>
                    <p className="text-muted-foreground text-xs">
                      {m.farmer.agripayId}
                      {m.payoutOrder ? ` · #${m.payoutOrder}` : ""}
                      {m.guarantor ? ` · ${t("groups.guarantor")}` : ""}
                    </p>
                  </TableCell>
                  <TableCell>{t(`groups.roles.${m.role}` as never)}</TableCell>
                  {shownPeriods.map((p) => (
                    <TableCell key={p} className="text-right text-xs tabular-nums">
                      {m.byPeriod[p] ? (
                        formatLe(m.byPeriod[p]!)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatLe(m.totalLe)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.onTimeRate == null ? "—" : `${Math.round(m.onTimeRate * 100)}%`}
                  </TableCell>
                  <TableCell>
                    {m.farmer.loans.map((l) => (
                      <StatusBadge key={l.ref} tone={toneFor(l.status)}>
                        {l.ref} · {t(`loanStatus.${l.status}`)}
                      </StatusBadge>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("groups.addMember")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AddMemberForm
                groupId={g.group.id}
                farmers={candidates
                  .filter((c) => !memberIds.has(c.id))
                  .map((c) => ({ id: c.id, label: `${c.fullName} · ${c.agripayId}` }))}
              />
            </CardContent>
          </Card>
        ) : null}
        {g.payouts.length ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("groups.paidOut")}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y text-sm">
              {g.payouts.map((p) => (
                <div key={p.id} className="flex justify-between py-2">
                  <span>
                    {t("groups.period")} {p.periodNo} · {p.farmer.fullName}
                  </span>
                  <span className="tabular-nums">{formatLe(p.amountLe.toFixed(2))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
