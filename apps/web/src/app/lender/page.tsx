import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HandCoinsIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { PageHeader, StatStrip } from "@agrilink/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatLe } from "@agrilink/validation";
import { requirePortal } from "@/server/auth/actor";
import { getPortfolio } from "@/server/credit/portfolio";

const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

export default async function LenderHome() {
  const { actor, context } = await requirePortal("/lender");
  const t = await getTranslations();
  if (actor.role === "SUPER_ADMIN")
    return (
      <PageHeader
        title={t("lender.portfolio")}
        description="Open the lender portal from a lender workspace."
      />
    );
  const p = await getPortfolio(actor);
  const queue = (p.statusCounts.APPLIED ?? 0) + (p.statusCounts.ACCEPTED ?? 0);
  const tables: [string, typeof p.byDistrict][] = [
    [t("lender.byDistrict"), p.byDistrict],
    [t("lender.byGender"), p.byGender.map((r) => ({ ...r, key: t(`gender.${r.key}` as never) }))],
    [t("lender.byCrop"), p.byCrop],
    [t("lender.byProduct"), p.byProduct],
  ];
  return (
    <>
      <PageHeader
        title={`${t("lender.portfolio")} · ${context.orgName}`}
        description={t("lender.portfolioSub")}
        actions={
          queue ? (
            <Button asChild>
              <Link href="/lender/applications">
                <HandCoinsIcon /> {t("lender.applications")} ({queue})
              </Link>
            </Button>
          ) : null
        }
      />
      <StatStrip
        className="mb-6"
        items={[
          { label: t("lender.loans"), value: p.total.loans },
          { label: t("lender.disbursed"), value: formatLe(p.total.disbursedLe) },
          { label: t("lender.outstanding"), value: formatLe(p.total.outstandingLe) },
          { label: t("lender.repaymentRate"), value: pct(p.total.repaymentRatePct), tone: "good" },
          {
            label: `${t("lender.par30")} / ${t("lender.par90")}`,
            value: `${pct(p.total.par30Pct)} / ${pct(p.total.par90Pct)}`,
            tone: Number(p.total.par30Pct) > 5 ? "danger" : undefined,
          },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {tables.map(([title, rows]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("lender.key")}</TableHead>
                    <TableHead className="text-right">{t("lender.loans")}</TableHead>
                    <TableHead className="text-right">{t("lender.outstanding")}</TableHead>
                    <TableHead className="text-right">{t("lender.par30")}</TableHead>
                    <TableHead className="text-right">{t("lender.repaymentRate")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground h-14 text-center">
                        {t("common.noResults")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell>{r.key}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.loans}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatLe(r.outstandingLe)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{pct(r.par30Pct)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(r.repaymentRatePct)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
