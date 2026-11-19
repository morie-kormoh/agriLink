import { getTranslations } from "next-intl/server";
import { EyeIcon, LightbulbIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import type { Factor } from "@agrilink/finance";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agrilink/ui/components/card";
import { PageHeader, StatusBadge } from "@agrilink/ui/components/blocks";
import { Progress } from "@agrilink/ui/components/misc";
import type { Actor } from "@agrilink/validation/permissions";
import { respondConsentAction, revokeConsentAction } from "@/app/actions/finance";
import { getMyPassport } from "@/server/passport/service";
import { PinConfirm } from "./pin-confirm";
import { ScoreDial, Sparkline, toneFor } from "./score-dial";

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export async function PassportPage({ actor }: { actor: Actor }) {
  const t = await getTranslations();
  const p = await getMyPassport(actor);
  const factors = p.score.factors as unknown as Factor[];
  const tips = factors.filter((f) => f.tip).sort((a, b) => b.max - b.points - (a.max - a.points));

  return (
    <>
      <PageHeader title={t("passport.title")} description={t("passport.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <ScoreDial
              score={p.score.score}
              band={p.score.band}
              bandLabel={t(`band.${p.score.band}`)}
              caption={t("passport.outOf")}
            />
            <Sparkline points={p.history.map((h) => h.score)} />
            <p className="text-muted-foreground text-center text-xs">
              {t("passport.computed", { date: fmt(p.score.computedAt) })} ·{" "}
              {t("passport.model", { version: p.score.modelVersion })}
            </p>
            <p className="bg-muted text-muted-foreground rounded-lg p-3 text-center text-xs">
              {t("passport.fairness")}
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {p.pending.length ? (
            <Card className="border-amber-300">
              <CardHeader>
                <CardTitle>{t("passport.requests")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {p.pending.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3">
                    <p className="font-medium">
                      {t("passport.wants", {
                        org: c.requesterOrg.name,
                        scope: t(`consentScope.${c.scope}`),
                      })}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t("passport.purpose", { purpose: c.purpose })} ·{" "}
                      {t("passport.duration", { months: c.durationMonths })}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <PinConfirm
                        label={t("passport.allow")}
                        icon={<ShieldCheckIcon />}
                        size="sm"
                        title={t("passport.allow")}
                        description={t("passport.wants", {
                          org: c.requesterOrg.name,
                          scope: t(`consentScope.${c.scope}`),
                        })}
                        action={respondConsentAction.bind(null, c.id, "GRANT")}
                        successMessage={t("passport.allowed")}
                      />
                      <PinConfirm
                        label={t("passport.decline")}
                        variant="outline"
                        size="sm"
                        title={t("passport.decline")}
                        action={respondConsentAction.bind(null, c.id, "DECLINE")}
                        successMessage={t("passport.declined")}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("passport.factors")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {factors.map((f) => (
                <div key={f.key} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">
                      {t(`passport.factorsLabel.${f.key}` as never)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {f.points} / {f.max}
                    </span>
                  </div>
                  <Progress value={(f.points / f.max) * 100} />
                  <p className="text-muted-foreground text-xs">{f.evidence}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {tips.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LightbulbIcon className="size-4 text-amber-500" /> {t("passport.howToImprove")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {tips.map((f) => (
                    <li key={f.key}>
                      {t(`passport.tips.${f.tip!.key}` as never, (f.tip!.params ?? {}) as never)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("passport.whoCanSee")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {p.granted.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("passport.nobody")}</p>
              ) : null}
              {p.granted.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{c.requesterOrg.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {t(`consentScope.${c.scope}`)} ·{" "}
                      {t("passport.until", { date: fmt(c.expiresAt) })}
                    </p>
                  </div>
                  <PinConfirm
                    label={t("passport.stop")}
                    icon={<ShieldOffIcon />}
                    variant="outline"
                    size="sm"
                    title={t("passport.stop")}
                    description={c.requesterOrg.name}
                    action={revokeConsentAction.bind(null, c.id)}
                    successMessage={t("passport.stopped")}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <EyeIcon className="size-4" /> {t("passport.viewLog")}
              </CardTitle>
              <CardDescription>
                {p.accessLog.length === 0 ? t("passport.noViews") : null}
              </CardDescription>
            </CardHeader>
            {p.accessLog.length ? (
              <CardContent className="divide-y text-sm">
                {p.accessLog.map((l) => (
                  <div key={l.id} className="flex justify-between py-2">
                    <span>{t("passport.viewedBy", { org: l.consent.requesterOrg.name })}</span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      <StatusBadge tone={toneFor("GRANTED")}>
                        {t(`consentScope.${l.scope}`)}
                      </StatusBadge>
                      {l.viewedAt.toLocaleString("en-GB")}
                    </span>
                  </div>
                ))}
              </CardContent>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
