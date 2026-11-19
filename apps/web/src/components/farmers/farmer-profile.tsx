import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MapPinIcon, NotebookPenIcon, PiggyBankIcon, SproutIcon, WalletIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Badge } from "@agrilink/ui/components/badge";
import { Field, PageHeader } from "@agrilink/ui/components/blocks";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { Alert, AlertDescription } from "@agrilink/ui/components/misc";
import { ageInYears, formatSlPhone, isYouth } from "@agrilink/validation";
import { type Actor, can } from "@agrilink/validation/permissions";
import { formatAcres, formatDate } from "@/lib/format";
import type { getFarmer } from "@/server/farmers/service";
import { FarmerIdCard } from "./id-card";
import { VerifyWalletButton } from "./verify-wallet-button";

type Farmer = Awaited<ReturnType<typeof getFarmer>>;

export async function FarmerProfile({
  farmer,
  actor,
  recordsHref,
  savingsHref,
}: {
  farmer: Farmer;
  actor: Actor;
  recordsHref?: string;
  savingsHref?: string;
}) {
  const t = await getTranslations();
  const canManageWallet = can(actor, "wallet.manage", {
    orgId: farmer.cooperativeId,
    farmerId: farmer.id,
    registeredById: farmer.registeredById,
  });
  const age = farmer.dateOfBirth ? ageInYears(farmer.dateOfBirth) : null;

  return (
    <>
      <PageHeader
        title={farmer.fullName}
        description={`${farmer.agrilinkId} · ${farmer.community}, ${farmer.chiefdom.name}, ${farmer.district.name}`}
        actions={
          <>
            {savingsHref ? (
              <Button variant="outline" asChild>
                <Link href={savingsHref}>
                  <PiggyBankIcon /> {t("nav.savings")}
                </Link>
              </Button>
            ) : null}
            {recordsHref ? (
              <Button variant="outline" asChild>
                <Link href={recordsHref}>
                  <NotebookPenIcon /> {t("farmer.viewRecords")}
                </Link>
              </Button>
            ) : null}
            <Badge
              variant={
                farmer.status === "ACTIVE"
                  ? "success"
                  : farmer.status === "DUPLICATE_SUSPECTED"
                    ? "warning"
                    : "muted"
              }
            >
              {t(`farmerStatus.${farmer.status}`)}
            </Badge>
          </>
        }
      />
      {farmer.status === "DUPLICATE_SUSPECTED" && farmer.duplicateNote ? (
        <Alert variant="warning" className="mb-4">
          <AlertDescription>{farmer.duplicateNote}</AlertDescription>
        </Alert>
      ) : null}
      {farmer.sharedPhone ? (
        <Alert variant="info" className="mb-4">
          <AlertDescription>{t("farmer.sharedPhoneWarning")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <FarmerIdCard
            agrilinkId={farmer.agrilinkId}
            fullName={farmer.fullName}
            district={farmer.district.name}
            cooperative={farmer.cooperative?.name ?? null}
            photoUrl={farmer.photoKey ? `/api/farmers/${farmer.id}/photo` : null}
            kycTier={farmer.kycTier}
          />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("farmer.profileTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Field label={t("farmer.fields.gender")}>{t(`gender.${farmer.gender}`)}</Field>
                <Field label={t("farmer.fields.dateOfBirth")}>
                  {farmer.dateOfBirth ? `${formatDate(farmer.dateOfBirth)} (${age})` : "—"}
                </Field>
                <Field label={t("farmer.fields.phone")}>{formatSlPhone(farmer.phone)}</Field>
                <Field label={t("farmer.fields.nin")}>
                  {farmer.nin ? `•••${farmer.nin.slice(-3)}` : "—"}
                </Field>
                <Field label={t("farmer.fields.householdSize")}>
                  {farmer.householdSize ?? "—"}
                </Field>
                <Field label={t("farmer.fields.isHouseholdHead")}>
                  {farmer.isHouseholdHead == null
                    ? "—"
                    : farmer.isHouseholdHead
                      ? t("common.yes")
                      : t("common.no")}
                </Field>
                <Field label={t("farmer.youth")}>
                  {isYouth(farmer.dateOfBirth) ? t("common.yes") : t("common.no")}
                </Field>
                <Field label={t("farmer.disability")}>
                  {farmer.hasDisability ? t("common.yes") : t("common.no")}
                </Field>
                <Field label={t("farmer.tier")}>T{farmer.kycTier}</Field>
                <Field label={t("farmer.fields.cooperative")}>
                  {farmer.cooperative?.name ?? "—"}
                </Field>
                <Field label={t("farmer.registeredBy")}>{farmer.registeredBy?.name ?? "—"}</Field>
                <Field label={t("farmer.registered")}>{formatDate(farmer.createdAt)}</Field>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WalletIcon className="size-4" /> {t("farmer.wallets")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {farmer.wallets.length === 0 ? (
                <p className="text-muted-foreground text-sm">—</p>
              ) : (
                <ul className="divide-y">
                  {farmer.wallets.map((w) => (
                    <li
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div>
                        <p className="font-medium">
                          {t(`providers.${w.provider}`)} · {formatSlPhone(w.msisdn)}
                        </p>
                        {w.accountName ? (
                          <p className="text-muted-foreground text-xs">{w.accountName}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {w.isPrimary ? (
                          <Badge variant="secondary">{t("farmer.primary")}</Badge>
                        ) : null}
                        <Badge variant={w.verified ? "success" : "muted"}>
                          {w.verified ? t("farmer.verified") : t("farmer.unverified")}
                        </Badge>
                        {!w.verified && canManageWallet ? (
                          <VerifyWalletButton
                            farmerId={farmer.id}
                            walletId={w.id}
                            label={t("farmer.verifyWallet")}
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SproutIcon className="size-4" /> {t("farmer.plots")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {farmer.plots.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("farmer.noPlots")}</p>
              ) : (
                <ul className="space-y-3">
                  {farmer.plots.map((p) => (
                    <li key={p.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {p.name ?? t("farmer.fields.plotName")} · {formatAcres(p.sizeAcres)}
                          {p.tenure ? ` · ${t(`tenure.${p.tenure}`)}` : ""}
                        </p>
                        {p.latitude != null && p.longitude != null ? (
                          <a
                            className="text-primary flex items-center gap-1 text-xs underline"
                            href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=16/${p.latitude}/${p.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MapPinIcon className="size-3" /> {p.latitude.toFixed(5)},{" "}
                            {p.longitude.toFixed(5)}
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {p.cropCycles.map((c) => (
                          <Badge key={c.id} variant="outline">
                            {c.crop.name} · {c.season}
                          </Badge>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
