import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@agripay/ui/components/blocks";
import { Badge } from "@agripay/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import { currentSeason, seasonCode } from "@agripay/validation";
import { hasPermission } from "@agripay/validation/permissions";
import { formatLe } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { coopSeasonTable } from "@/server/records/service";
import { CloseSeasonButton, SeasonPicker } from "./season-client";

function recentSeasons() {
  const y = new Date().getUTCFullYear();
  return [`${y}-DRY`, `${y}-MAIN`, `${y - 1}-DRY`, `${y - 1}-MAIN`];
}

export default async function CoopSeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const { actor } = await requirePortal("/coop");
  if (!hasPermission(actor.role, "record.read")) redirect("/coop");
  const t = await getTranslations();
  const raw = (await searchParams).season;
  const season = seasonCode.safeParse(raw).success ? raw! : currentSeason();
  const rows = await coopSeasonTable(actor, season);
  const totals = rows.reduce(
    (a, r) => ({
      cost: a.cost + Number(r.totals.totalCostLe),
      sales: a.sales + Number(r.totals.totalSalesLe),
    }),
    { cost: 0, sales: 0 },
  );
  return (
    <>
      <PageHeader
        title={t("records.seasonsTitle")}
        description={t("records.seasonsSubtitle")}
        actions={
          <>
            <SeasonPicker season={season} seasons={[...new Set([season, ...recentSeasons()])]} />
            {hasPermission(actor.role, "season.close") ? (
              <CloseSeasonButton season={season} disabled={rows.length === 0} />
            ) : null}
          </>
        }
      />
      <p className="text-muted-foreground mb-3 text-sm">
        {t("records.members")}: {rows.length} · {t("records.spent")} {formatLe(totals.cost)} ·{" "}
        {t("records.sold")} {formatLe(totals.sales)}
      </p>
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("farmer.agripayId")}</TableHead>
              <TableHead>{t("farmer.name")}</TableHead>
              <TableHead className="text-right">{t("records.spent")}</TableHead>
              <TableHead className="text-right">{t("records.sold")}</TableHead>
              <TableHead className="text-right">{t("records.net")}</TableHead>
              <TableHead className="text-right">{t("records.harvest")}</TableHead>
              <TableHead>SMS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground h-20 text-center">
                  {t("records.none")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.farmer.id}>
                  <TableCell className="font-mono text-xs">{r.farmer.agripayId}</TableCell>
                  <TableCell>{r.farmer.fullName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(r.totals.totalCostLe)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(r.totals.totalSalesLe)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(r.totals.netLe)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.totals.harvestKg).toLocaleString("en")} kg
                  </TableCell>
                  <TableCell>
                    {r.closed?.smsSentAt ? (
                      <Badge variant="success">✓</Badge>
                    ) : (
                      <Badge variant="muted">—</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
