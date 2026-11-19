import { getTranslations } from "next-intl/server";
import { StatStrip } from "@agrilink/ui/components/blocks";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { Progress } from "@agrilink/ui/components/misc";
import { percent } from "@/lib/format";
import type { platformStats } from "@/server/admin/service";

type Stats = Awaited<ReturnType<typeof platformStats>>;

/** KPI tiles with gender / youth / disability disaggregation (challenge reporting requirement). */
export async function StatsGrid({ stats }: { stats: Stats }) {
  const t = await getTranslations();
  const max = Math.max(1, ...stats.byDistrict.map((d) => d.count));
  return (
    <div className="space-y-6">
      <StatStrip
        items={[
          { label: t("admin.farmers"), value: stats.farmers.toLocaleString("en") },
          {
            label: t("admin.women"),
            value: percent(stats.women, stats.farmers),
            hint: stats.women.toLocaleString("en"),
          },
          {
            label: t("admin.youth"),
            value: percent(stats.youth, stats.farmers),
            hint: stats.youth.toLocaleString("en"),
          },
          { label: t("farmer.disability"), value: stats.disability.toLocaleString("en") },
          { label: t("nav.duplicates"), value: stats.duplicates.toLocaleString("en") },
        ]}
      />
      {stats.byDistrict.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("farmer.fields.district")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.byDistrict.map((d) => (
              <div
                key={d.district}
                className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm"
              >
                <span className="truncate">{d.district}</span>
                <Progress value={(d.count / max) * 100} />
                <span className="text-right tabular-nums">{d.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
