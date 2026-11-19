import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { translateEvidence } from "@agrilink/i18n/text";
import { ArrowLeftIcon } from "lucide-react";
import type { Factor } from "@agrilink/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { Field, PageHeader } from "@agrilink/ui/components/blocks";
import { Progress } from "@agrilink/ui/components/misc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatLe } from "@agrilink/validation";
import { ScoreDial } from "@/components/finance/score-dial";
import { requirePortal } from "@/server/auth/actor";
import { notFoundOn404 } from "@/server/page-helpers";
import { getPassportForLender } from "@/server/passport/service";

/** Lender passport view: consent required, every view logged; watermarked with viewer + time. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { actor, user, context } = await requirePortal("/lender");
  const t = await getTranslations();
  const locale = await getLocale();
  const { id } = await params;
  const p = await notFoundOn404(() => getPassportForLender(actor, id));
  const factors = p.score.factors as unknown as Factor[];
  const mark = t("lender.watermark", {
    name: user.name ?? user.phone,
    org: context.orgName ?? "",
    time: new Date().toLocaleString("en-GB"),
  });
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 flex flex-wrap content-start gap-24 overflow-hidden p-10 opacity-[0.06] select-none"
      >
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className="-rotate-12 text-lg font-semibold whitespace-nowrap">
            {mark}
          </span>
        ))}
      </div>
      <div className="relative z-10">
        <Link
          href="/lender/farmers"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> {t("lender.farmers")}
        </Link>
        <PageHeader
          title={p.farmer.fullName}
          description={`${p.farmer.agrilinkId} · ${p.farmer.district}${p.farmer.cooperative ? ` · ${p.farmer.cooperative}` : ""}`}
        />
        <p className="text-muted-foreground mb-4 rounded-lg border border-dashed p-2 text-xs">
          {mark}
        </p>
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6">
              <ScoreDial
                score={p.score.score}
                band={p.score.band}
                bandLabel={t(`band.${p.score.band}`)}
                caption={t("passport.outOf")}
              />
              <p className="text-muted-foreground text-center text-xs">
                {p.score.modelVersion} · {p.score.computedAt.toLocaleDateString("en-GB")}
              </p>
              <dl className="w-full space-y-2 text-sm">
                <Field label={t("lender.scope")}>{t(`consentScope.${p.consent.scope}`)}</Field>
                <Field label={t("lender.purpose2")}>{p.consent.purpose}</Field>
                <Field
                  label={t("common.ref")}
                >{`${p.consent.ref} → ${p.consent.expiresAt?.toLocaleDateString("en-GB")}`}</Field>
              </dl>
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("passport.factors")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {factors.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{t(`passport.factorsLabel.${f.key}` as never)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {f.points}/{f.max}
                      </span>
                    </div>
                    <Progress value={(f.points / f.max) * 100} />
                    <p className="text-muted-foreground text-xs">
                      {translateEvidence(locale, f.evidence)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            {p.detail ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("records.seasonsTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("records.season")}</TableHead>
                        <TableHead className="text-right">{t("records.spent")}</TableHead>
                        <TableHead className="text-right">{t("records.sold")}</TableHead>
                        <TableHead className="text-right">{t("records.net")}</TableHead>
                        <TableHead className="text-right">{t("records.harvest")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.detail.seasons.map((s) => (
                        <TableRow key={s.season}>
                          <TableCell>{s.season}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatLe(s.totalCostLe)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatLe(s.totalSalesLe)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatLe(s.netLe)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.harvestKg} kg
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : null}
            {p.detail ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("savings.title")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {p.detail.savings.length === 0 ? (
                      <p className="text-muted-foreground">—</p>
                    ) : null}
                    {p.detail.savings.map((s, i) => (
                      <p key={i} className="flex justify-between">
                        <span>
                          {t(`savingsType.${s.type}`)} · {s.since.toLocaleDateString("en-GB")}
                        </span>
                        <span className="tabular-nums">{formatLe(s.balanceLe)}</span>
                      </p>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t("passport.factorsLabel.repayment")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {p.detail.loans.length === 0 ? (
                      <p className="text-muted-foreground">—</p>
                    ) : null}
                    {p.detail.loans.map((l, i) => (
                      <p key={i} className="flex justify-between">
                        <span>
                          {t(`loanStatus.${l.status}`)}
                          {l.wasLate ? " · late" : ""}
                          {l.withYou ? " · you" : ""}
                        </span>
                        <span className="tabular-nums">
                          {l.amountLe ? formatLe(l.amountLe) : "—"}
                        </span>
                      </p>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : null}
            {p.records ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("records.title")}</CardTitle>
                </CardHeader>
                <CardContent className="max-h-96 divide-y overflow-auto text-sm">
                  {p.records.map((r) => (
                    <p key={r.id} className="flex justify-between gap-2 py-1.5">
                      <span>
                        {r.occurredAt.toLocaleDateString("en-GB")} · {t(`recordType.${r.type}`)} ·{" "}
                        {t(`verification.${r.verification}`)}
                      </span>
                      <span className="tabular-nums">
                        {r.amountLe
                          ? formatLe(r.amountLe.toFixed(2))
                          : `${r.quantity?.toString() ?? ""} ${r.unit ?? ""}`}
                      </span>
                    </p>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
