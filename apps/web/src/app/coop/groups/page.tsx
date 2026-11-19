import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UsersIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@agrilink/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatLe } from "@agrilink/validation";
import { hasPermission } from "@agrilink/validation/permissions";
import { CreateGroupForm } from "@/components/finance/groups-client";
import { requirePortal } from "@/server/auth/actor";
import { listGroups } from "@/server/savings/groups";

export default async function Page() {
  const { actor } = await requirePortal("/coop");
  const t = await getTranslations();
  const groups = await listGroups(actor);
  return (
    <>
      <PageHeader title={t("groups.title")} description={t("groups.subtitle")} />
      <div className="space-y-6">
        {hasPermission(actor.role, "group.manage") ? <CreateGroupForm /> : null}
        {groups.length === 0 ? (
          <EmptyState icon={UsersIcon} title={t("groups.empty")} />
        ) : (
          <div className="bg-card overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("groups.name")}</TableHead>
                  <TableHead>{t("groups.type")}</TableHead>
                  <TableHead className="text-right">{t("groups.members")}</TableHead>
                  <TableHead>{t("groups.period")}</TableHead>
                  <TableHead className="text-right">{t("groups.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link className="font-medium hover:underline" href={`/coop/groups/${g.id}`}>
                        {g.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">{g.ref}</p>
                    </TableCell>
                    <TableCell>{t(`groups.types.${g.type}` as never)}</TableCell>
                    <TableCell className="text-right tabular-nums">{g._count.members}</TableCell>
                    <TableCell>
                      {t("groups.periodOf", { n: g.currentPeriod, total: g.periods })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatLe(g.totalLe)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
