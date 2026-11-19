import { getTranslations } from "next-intl/server";
import { MonitorSmartphoneIcon } from "lucide-react";
import { prisma } from "@agrilink/db";
import { Badge } from "@agrilink/ui/components/badge";
import { PageHeader } from "@agrilink/ui/components/blocks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agrilink/ui/components/card";
import { formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/actor";
import { listActiveSessions } from "@/server/auth/session";
import { PinForm, SignOutOthersButton } from "./security-client";

export default async function SecurityPage() {
  const { user, sessionId } = await getCurrentUser();
  const t = await getTranslations("security");
  const [sessions, record] = await Promise.all([
    listActiveSessions(user.id),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { pinLockedUntil: true } }),
  ]);
  const locked =
    record.pinLockedUntil && record.pinLockedUntil > new Date() ? record.pinLockedUntil : null;

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("pinTitle")}
              <Badge variant={user.pinSet ? "success" : "warning"}>
                {user.pinSet ? t("pinSet") : t("pinNotSet")}
              </Badge>
            </CardTitle>
            <CardDescription>{t("pinBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            {locked ? (
              <p className="text-destructive mb-3 text-sm">
                {t("pinLocked", { time: formatDateTime(locked) })}
              </p>
            ) : null}
            <PinForm hasPin={user.pinSet} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("sessionsTitle")}</CardTitle>
            {sessions.length > 1 ? <SignOutOthersButton label={t("signOutOthers")} /> : null}
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  <MonitorSmartphoneIcon className="text-muted-foreground size-4" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{s.userAgent ?? "Unknown device"}</p>
                    <p className="text-muted-foreground text-xs">
                      {t("lastSeen", { time: formatDateTime(s.lastSeenAt) })}
                      {s.ip ? ` · ${s.ip}` : ""}
                    </p>
                  </div>
                  {s.id === sessionId ? <Badge variant="secondary">{t("thisDevice")}</Badge> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
