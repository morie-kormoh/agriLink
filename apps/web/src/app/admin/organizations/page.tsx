import { getTranslations } from "next-intl/server";
import { prisma } from "@agrilink/db";
import { Badge } from "@agrilink/ui/components/badge";
import { PageHeader } from "@agrilink/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatDate } from "@/lib/format";
import { listOrganizations } from "@/server/admin/service";
import { requirePortal } from "@/server/auth/actor";
import { NewOrganizationDialog, OrgActiveToggle } from "./org-client";

export default async function AdminOrganizationsPage() {
  const { actor } = await requirePortal("/admin");
  const t = await getTranslations();
  const [orgs, districts] = await Promise.all([
    listOrganizations(actor),
    prisma.district.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title={t("nav.organizations")}
        actions={<NewOrganizationDialog districts={districts} />}
      />
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.orgName")}</TableHead>
              <TableHead>{t("admin.orgType")}</TableHead>
              <TableHead>{t("farmer.fields.district")}</TableHead>
              <TableHead className="text-right">{t("team.members")}</TableHead>
              <TableHead className="text-right">{t("admin.farmers")}</TableHead>
              <TableHead>{t("farmer.registered")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{o.type}</Badge>
                </TableCell>
                <TableCell>{o.district?.name ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{o._count.memberships}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {o.type === "COOPERATIVE" ? o._count.members : "—"}
                </TableCell>
                <TableCell>{formatDate(o.createdAt)}</TableCell>
                <TableCell>
                  <OrgActiveToggle orgId={o.id} active={o.active} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
