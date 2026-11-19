import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@agrilink/db";
import { PageHeader, StatStrip } from "@agrilink/ui/components/blocks";
import { cn } from "@agrilink/ui/lib/utils";
import { StatsGrid } from "@/components/stats-grid";
import { formatLe } from "@/lib/format";
import { platformStats } from "@/server/admin/service";
import { requirePortal } from "@/server/auth/actor";

const PIPELINE = ["PENDING", "PROCESSING", "SUCCESS", "PARTIAL", "FAILED"] as const;
const STAGE_STYLE: Record<string, string> = {
  PENDING: "border-t-slate",
  PROCESSING: "border-t-teal",
  SUCCESS: "border-t-paddy",
  PARTIAL: "border-t-gold",
  FAILED: "border-t-kola",
};

/** Platform overview (docs/ui §7.1): key numbers, then the payment pipeline, then farmer reach. */
export default async function AdminHome() {
  const { actor } = await requirePortal("/admin");
  const t = await getTranslations();
  const [stats, byStatus] = await Promise.all([
    platformStats(actor),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true }, _sum: { grossLe: true } }),
  ]);
  const stage = (s: string) => byStatus.find((b) => b.status === s);
  const paidOut = stage("SUCCESS")?._sum.grossLe?.toString() ?? "0";
  const attention = (stage("FAILED")?._count._all ?? 0) + (stage("PARTIAL")?._count._all ?? 0);
  return (
    <>
      <PageHeader title={t("admin.dashboardTitle")} />
      <StatStrip
        className="mb-6"
        items={[
          { label: t("admin.paidOut"), value: formatLe(paidOut) },
          { label: t("admin.farmers"), value: stats.farmers.toLocaleString("en") },
          { label: t("admin.users"), value: stats.users.toLocaleString("en") },
          { label: t("admin.organizations"), value: stats.orgs.toLocaleString("en") },
          {
            label: t("admin.needsAttention"),
            value: attention.toLocaleString("en"),
            tone: attention ? "danger" : undefined,
          },
        ]}
      />

      <section className="mb-8">
        <h2 className="text-xl font-bold">{t("admin.pipeline")}</h2>
        <p className="text-muted-foreground mb-3 text-sm">{t("admin.pipelineHint")}</p>
        <ol className="grid gap-3 sm:grid-cols-5">
          {PIPELINE.map((s) => {
            const row = stage(s);
            return (
              <li key={s}>
                <Link
                  href={`/admin/payments?status=${s}`}
                  className={cn(
                    "bg-card hover:border-indigo/40 block rounded-xl border border-t-4 p-4 transition-colors",
                    STAGE_STYLE[s],
                  )}
                >
                  <p className="text-muted-foreground text-sm font-semibold">
                    {t(`paymentStatus.${s}`)}
                  </p>
                  <p className="font-display mt-1 text-3xl font-bold tabular-nums">
                    {(row?._count._all ?? 0).toLocaleString("en")}
                  </p>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {formatLe(row?._sum.grossLe?.toString() ?? "0")}
                  </p>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <StatsGrid stats={stats} />
    </>
  );
}
