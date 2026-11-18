import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agripay/ui/components/card";
import { Alert, AlertDescription } from "@agripay/ui/components/misc";
import { getSessionUser, listContexts } from "@/server/auth/actor";
import { ContextPicker } from "./context-picker";

export const metadata: Metadata = { title: "Choose workspace" };

export default async function SelectContextPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; denied?: string }>;
}) {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  const { next, denied } = await searchParams;
  const t = await getTranslations();
  const contexts = await listContexts(su.user.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("auth.selectContextTitle")}</CardTitle>
        <CardDescription>{t("auth.selectContextSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {denied ? (
          <Alert variant="warning">
            <AlertDescription>
              That page belongs to a different workspace. Choose one below.
            </AlertDescription>
          </Alert>
        ) : null}
        {contexts.length === 0 ? (
          <Alert variant="warning">
            <AlertDescription>{t("auth.errors.noAccount")}</AlertDescription>
          </Alert>
        ) : (
          <ContextPicker
            next={next ?? null}
            contexts={contexts.map((c) => ({
              orgId: c.orgId,
              role: c.role,
              label: c.orgName ?? t("auth.asFarmer"),
              roleLabel: t(`roles.${c.role}`),
              current: su.session.activeOrgId === c.orgId && su.session.activeRole === c.role,
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}
