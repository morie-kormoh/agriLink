import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@agrilink/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agrilink/ui/components/card";
import { Alert, AlertDescription } from "@agrilink/ui/components/misc";
import { getSessionUser } from "@/server/auth/actor";
import { getInvitationByToken } from "@/server/auth/invitations";
import { AcceptInviteButton } from "./accept-button";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations();
  const inv = await getInvitationByToken(token);
  const su = await getSessionUser();

  if (!inv || !inv.usable) {
    return (
      <Card>
        <CardContent>
          <Alert variant="warning">
            <AlertDescription>{t("team.expired")}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const phoneMatches = su?.user.phone === inv.phone;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("team.acceptTitle", { org: inv.org.name })}</CardTitle>
        <CardDescription>{t("team.acceptBody", { role: t(`roles.${inv.role}`) })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!su ? (
          <Button asChild className="w-full" size="lg">
            <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
              {t("team.signInToAccept", { phone: inv.phoneDisplay })}
            </Link>
          </Button>
        ) : phoneMatches ? (
          <AcceptInviteButton token={token} label={t("team.accept")} />
        ) : (
          <Alert variant="warning">
            <AlertDescription>{t("team.wrongPhone")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
