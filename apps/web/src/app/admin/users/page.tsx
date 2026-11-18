import { getTranslations } from "next-intl/server";
import { Badge } from "@agripay/ui/components/badge";
import { PageHeader } from "@agripay/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import { formatSlPhone } from "@agripay/validation";
import { Pagination } from "@/components/pagination";
import { formatDateTime } from "@/lib/format";
import { listUsers } from "@/server/admin/service";
import { requirePortal } from "@/server/auth/actor";
import { UserActions } from "./user-actions";
import { UserSearch } from "./user-search";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requirePortal("/admin");
  const t = await getTranslations();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { items, total, pages } = await listUsers(actor, q, page);

  return (
    <>
      <PageHeader title={t("nav.users")} description={`${total.toLocaleString("en")}`} />
      <UserSearch initial={q ?? ""} />
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("team.name")}</TableHead>
              <TableHead>{t("team.phone")}</TableHead>
              <TableHead>{t("team.role")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("admin.lastLogin")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => {
              const locked = !!u.pinLockedUntil && u.pinLockedUntil > new Date();
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                  <TableCell>{formatSlPhone(u.phone)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      {u.farmer ? (
                        <Badge variant="secondary">
                          {t("roles.FARMER")} · {u.farmer.agripayId}
                        </Badge>
                      ) : null}
                      {u.memberships.map((m) => (
                        <Badge key={m.id} variant="outline">
                          {t(`roles.${m.role}`)} · {m.org.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge
                        variant={
                          u.status === "ACTIVE"
                            ? "success"
                            : u.status === "SUSPENDED"
                              ? "destructive"
                              : "muted"
                        }
                      >
                        {u.status}
                      </Badge>
                      {locked ? <Badge variant="warning">PIN locked</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(u.lastLoginAt)}</TableCell>
                  <TableCell className="text-right">
                    {u.id !== actor.userId ? (
                      <UserActions userId={u.id} status={u.status} pinLocked={locked} />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        pages={pages}
        total={total}
        searchParams={sp}
        basePath="/admin/users"
      />
    </>
  );
}
