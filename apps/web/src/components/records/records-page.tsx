import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@agrilink/db";
import { PageHeader } from "@agrilink/ui/components/blocks";
import { currentSeason, seasonCode } from "@agrilink/validation";
import { type Actor, hasPermission } from "@agrilink/validation/permissions";
import {
  EDIT_WINDOW_MS,
  getSeasonOverview,
  listRecords,
  seasonsFor,
} from "@/server/records/service";
import { RecordsPanel, type RecordRow } from "./records-panel";

/** Records for one farmer — used by the farmer portal and by agents / co-op staff. */
export async function RecordsPage({
  actor,
  farmerId,
  season: rawSeason,
  backHref,
  title,
}: {
  actor: Actor;
  farmerId: string;
  season?: string;
  backHref?: string;
  title?: string;
}) {
  const t = await getTranslations("records");
  const season = seasonCode.safeParse(rawSeason).success ? rawSeason! : currentSeason();
  const [records, seasons, overview, crops] = await Promise.all([
    listRecords(actor, farmerId, season),
    seasonsFor(actor, farmerId),
    getSeasonOverview(actor, farmerId, season),
    prisma.crop.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const rows: RecordRow[] = records.map((r) => ({
    id: r.id,
    type: r.type,
    description: r.description,
    amountLe: r.amountLe?.toFixed(2) ?? null,
    quantity: r.quantity?.toString() ?? null,
    unit: r.unit,
    occurredAt: r.occurredAt.toISOString(),
    verification: r.verification,
    editable:
      r.verification !== "SYSTEM_VERIFIED" &&
      r.createdById === actor.userId &&
      Date.now() - r.createdAt.getTime() < EDIT_WINDOW_MS,
  }));
  return (
    <>
      {backHref ? (
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> {title ?? ""}
        </Link>
      ) : null}
      <PageHeader
        title={t("title")}
        description={title ? `${title} · ${t("subtitle")}` : t("subtitle")}
      />
      <RecordsPanel
        farmerId={farmerId}
        season={season}
        seasons={seasons.includes(season) ? seasons : [season, ...seasons]}
        records={rows}
        totals={overview.totals}
        crops={crops}
        canAdd={hasPermission(actor.role, "record.create")}
      />
    </>
  );
}
