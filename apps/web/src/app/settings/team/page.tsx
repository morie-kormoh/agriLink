import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@agripay/ui/components/badge";
import { PageHeader } from "@agripay/ui/components/blocks";
import { Card, CardContent, CardHeader, CardTitle } from "@agripay/ui/components/card";
import { formatSlPhone } from "@agripay/validation";
import { INVITABLE_ROLES, hasPermission } from "@agripay/validation/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { listTeam } from "@/server/admin/service";
import { getCurrentUser } from "@/server/auth/actor";
import { InviteMemberForm, RemoveMemberButton, RevokeInviteButton } from "./team-client";

export default async function TeamPage() {
  const { actor } = await getCurrentUser();
  if (!hasPermission(actor.role, "member.manage") || !actor.orgId) redirect("/settings/security");
  const t = await getTranslations();
  const { org, members, invitations } = await listTeam(actor);
  const roles = (INVITABLE_ROLES[actor.role] ?? []).map((r) => ({
    value: r,
    label: t(`roles.${r}`),
  }));

  return (
    <>
      <PageHeader title={t("team.title")} description={t("team.subtitle", { org: org.name })} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("team.invite")}</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteMemberForm roles={roles} />
          </CardContent>
        </Card>

        {invitations.length ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("team.pending")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium">{formatSlPhone(i.phone)}</p>
                      <p className="text-muted-foreground text-xs">
                        {t(`roles.${i.role}`)} · {t("team.expires")} {formatDate(i.expiresAt)}
                      </p>
                    </div>
                    <RevokeInviteButton id={i.id} label={t("team.revoke")} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t("team.members")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{m.user.name ?? formatSlPhone(m.user.phone)}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatSlPhone(m.user.phone)} · {t("admin.lastLogin")}:{" "}
                      {formatDateTime(m.user.lastLoginAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t(`roles.${m.role}`)}</Badge>
                    {m.userId !== actor.userId ? (
                      <RemoveMemberButton id={m.id} label={t("team.remove")} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
