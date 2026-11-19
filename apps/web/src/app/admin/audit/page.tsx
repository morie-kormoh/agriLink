import { getTranslations } from "next-intl/server";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
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
import { formatDateTime } from "@/lib/format";
import { listAudit } from "@/server/admin/service";
import { verifyAuditChain } from "@/server/audit";
import { requirePortal } from "@/server/auth/actor";

/** Minimal audit viewer (full viewer with diffs comes with module 13). */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; entityId?: string }>;
}) {
  const { actor } = await requirePortal("/admin");
  const t = await getTranslations();
  const sp = await searchParams;
  const [rows, chain] = await Promise.all([
    listAudit(actor, { entity: sp.entity, entityId: sp.entityId, take: 200 }),
    verifyAuditChain(),
  ]);

  return (
    <>
      <PageHeader
        title={t("nav.audit")}
        actions={
          chain.ok ? (
            <Badge variant="success">
              <ShieldCheckIcon /> Hash chain OK · {chain.checked}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <ShieldAlertIcon /> Chain broken at {chain.brokenAt}
            </Badge>
          )
        }
      />
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{formatDateTime(r.createdAt)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{r.action}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.entity}:{r.entityId.slice(0, 12)}
                </TableCell>
                <TableCell className="text-xs">
                  {r.actorRole ?? "—"} {r.actorUserId ? `· ${r.actorUserId.slice(0, 8)}` : ""}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-md truncate font-mono text-xs">
                  {r.after ? JSON.stringify(r.after) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
