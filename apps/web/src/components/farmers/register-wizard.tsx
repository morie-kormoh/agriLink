"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CameraIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  LocateFixedIcon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type Gender, LandTenure, MobileMoneyProvider } from "@agrilink/db/enums";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent, CardFooter } from "@agrilink/ui/components/card";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import {
  Alert,
  AlertDescription,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Switch,
} from "@agrilink/ui/components/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrilink/ui/components/select";
import { toast } from "@agrilink/ui/components/sonner";
import { Stepper } from "@agrilink/ui/components/stepper";
import {
  type RegisterFarmerData,
  type RegisterFarmerInput,
  currentSeason,
  formatSlPhone,
  normalizeSlPhone,
  registerFarmerSchema,
} from "@agrilink/validation";
import { useOptionalSync } from "@/components/offline/sync-provider";
import { offlineDb } from "@/lib/offline/db";
import { compressImage } from "@/lib/offline/photo";
import { enqueueFarmer, syncPending } from "@/lib/offline/sync";
import type { ReferenceData } from "@/server/reference";

type FieldName = keyof RegisterFarmerInput;

const STEP_FIELDS: FieldName[][] = [
  ["fullName", "gender", "dateOfBirth", "nin", "hasDisability", "householdSize", "isHouseholdHead"],
  ["districtId", "chiefdomId", "community", "cooperativeId"],
  ["phone", "walletProvider", "walletMsisdn"],
  ["plotName", "sizeAcres", "tenure", "cropId", "season", "latitude", "longitude", "gpsAccuracyM"],
  ["consentToRegister"],
  [],
];

type Done = {
  fullName: string;
  agrilinkId?: string;
  farmerId?: string;
  offline: boolean;
  duplicateOf?: string | null;
  warnings?: string[];
};

function emptyValues(reference: ReferenceData, cooperativeId: string | null): RegisterFarmerInput {
  return {
    clientRef: null,
    cooperativeId: cooperativeId ?? reference.cooperatives[0]?.id ?? null,
    consentToRegister: false as unknown as true,
    fullName: "",
    gender: undefined as unknown as Gender,
    dateOfBirth: "",
    nin: "",
    hasDisability: false,
    householdSize: null,
    isHouseholdHead: null,
    districtId: "",
    chiefdomId: "",
    community: "",
    phone: "",
    walletProvider: null,
    walletMsisdn: "",
    plotName: "",
    sizeAcres: "" as unknown as number,
    tenure: null,
    cropId: "",
    season: currentSeason(),
    latitude: null,
    longitude: null,
    gpsAccuracyM: null,
  };
}

export function RegisterWizard({
  reference,
  ownerUserId,
  profileBase,
}: {
  reference: ReferenceData;
  ownerUserId: string;
  /** e.g. "/agent/farmers" — used for the "view farmer" link after a successful sync */
  profileBase: string;
}) {
  const t = useTranslations();
  const sync = useOptionalSync();
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [gpsState, setGpsState] = useState<{
    status: "idle" | "busy" | "ok" | "error";
    message?: string;
  }>({ status: "idle" });
  const [done, setDone] = useState<Done | null>(null);
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<RegisterFarmerInput, unknown, RegisterFarmerData>({
    resolver: zodResolver(registerFarmerSchema),
    defaultValues: emptyValues(reference, null),
    mode: "onTouched",
  });
  const { register, control, watch, setValue, trigger, formState, getValues, reset } = form;
  const errors = formState.errors as Partial<Record<FieldName, { message?: string }>>;

  const districtId = watch("districtId");
  const district = useMemo(
    () => reference.districts.find((d) => d.id === districtId),
    [reference, districtId],
  );
  const steps = [
    t("farmer.steps.person"),
    t("farmer.steps.location"),
    t("farmer.steps.contact"),
    t("farmer.steps.farm"),
    t("farmer.steps.consent"),
    t("farmer.steps.review"),
  ];

  async function next() {
    const fields = STEP_FIELDS[step] ?? [];
    const ok = fields.length ? await trigger(fields as never) : true;
    if (ok) setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function captureGps() {
    if (!("geolocation" in navigator)) {
      setGpsState({ status: "error", message: t("farmer.fields.gpsUnavailable") });
      return;
    }
    setGpsState({ status: "busy" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const accuracy = Math.round(pos.coords.accuracy);
        if (accuracy >= 50) {
          setGpsState({
            status: "error",
            message: t("farmer.fields.gpsTooInaccurate", { accuracy }),
          });
          return;
        }
        setValue("latitude", Number(pos.coords.latitude.toFixed(6)), { shouldDirty: true });
        setValue("longitude", Number(pos.coords.longitude.toFixed(6)), { shouldDirty: true });
        setValue("gpsAccuracyM", accuracy, { shouldDirty: true });
        setGpsState({ status: "ok", message: t("farmer.fields.gpsCaptured", { accuracy }) });
      },
      () => setGpsState({ status: "error", message: t("farmer.fields.gpsUnavailable") }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const compressed = await compressImage(file).catch(() => file);
    setPhoto(compressed);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(compressed));
  }

  async function submit() {
    const valid = await trigger();
    if (!valid) {
      const firstBad = STEP_FIELDS.findIndex((fields) =>
        fields.some((f) => form.getFieldState(f as never).invalid),
      );
      if (firstBad >= 0) setStep(firstBad);
      toast.error(t("common.somethingWrong"));
      return;
    }
    startSaving(async () => {
      const values = getValues();
      const clientRef = crypto.randomUUID();
      await enqueueFarmer({ ...values, clientRef }, ownerUserId, photo);
      if (navigator.onLine) {
        await (sync ? sync.syncNow(true) : syncPending({ ownerUserId, force: true }));
      }
      const rec = await offlineDb().pendingFarmers.get(clientRef);
      const result: Done =
        rec?.status === "synced"
          ? {
              fullName: rec.fullName,
              agrilinkId: rec.agrilinkId,
              farmerId: rec.farmerId,
              offline: false,
              duplicateOf: rec.duplicateOf,
              warnings: rec.warnings,
            }
          : { fullName: String(values.fullName), offline: true };
      if (rec?.status === "invalid") {
        toast.error(rec.error ?? t("common.somethingWrong"));
      } else if (result.offline) {
        toast.info(t("farmer.savedOffline"));
      } else {
        toast.success(
          t("farmer.registeredToast", {
            name: result.fullName,
            agrilinkId: result.agrilinkId ?? "",
          }),
        );
      }
      setDone(result);
      reset(emptyValues(reference, values.cooperativeId ?? null));
      setPhoto(null);
      setPhotoUrl(null);
      setGpsState({ status: "idle" });
      setStep(0);
    });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2Icon className="text-success mt-0.5 size-6 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">
                {done.offline
                  ? t("farmer.savedOffline")
                  : t("farmer.registeredToast", {
                      name: done.fullName,
                      agrilinkId: done.agrilinkId ?? "",
                    })}
              </p>
              {done.agrilinkId ? (
                <p className="text-primary font-mono text-2xl font-bold tracking-wider">
                  {done.agrilinkId}
                </p>
              ) : null}
            </div>
          </div>
          {done.duplicateOf ? (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                {t("farmer.duplicateWarning", {
                  name: done.fullName,
                  agrilinkId: done.duplicateOf,
                })}
              </AlertDescription>
            </Alert>
          ) : null}
          {done.warnings?.includes("SHARED_PHONE") ? (
            <Alert variant="info">
              <AlertDescription>{t("farmer.sharedPhoneWarning")}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={() => setDone(null)}>{t("farmer.registerTitle")}</Button>
          {done.farmerId ? (
            <Button variant="outline" asChild>
              <Link href={`${profileBase}/${done.farmerId}`}>{t("common.view")}</Link>
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    );
  }

  const err = (name: FieldName) =>
    errors[name]?.message ? (
      <p className="text-destructive text-sm">{errors[name]?.message}</p>
    ) : null;
  const values = watch();

  return (
    <Card>
      <CardContent className="space-y-6">
        <Stepper steps={steps} current={step} />

        {step === 0 && (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t("farmer.fields.fullName")}</Label>
              <Input
                id="fullName"
                autoComplete="off"
                autoFocus
                {...register("fullName")}
                aria-invalid={!!errors.fullName}
              />
              {err("fullName")}
            </div>
            <div className="space-y-2">
              <Label>{t("farmer.fields.gender")}</Label>
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    className="grid grid-cols-2 gap-2"
                  >
                    {(["FEMALE", "MALE"] as const).map((g) => (
                      <Label
                        key={g}
                        className="has-[[data-state=checked]]:border-primary flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3"
                      >
                        <RadioGroupItem value={g} /> {t(`gender.${g}`)}
                      </Label>
                    ))}
                    {(["OTHER", "UNDISCLOSED"] as const).map((g) => (
                      <Label
                        key={g}
                        className="text-muted-foreground has-[[data-state=checked]]:border-primary flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3"
                      >
                        <RadioGroupItem value={g} /> {t(`gender.${g}`)}
                      </Label>
                    ))}
                  </RadioGroup>
                )}
              />
              {err("gender")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dob">
                  {t("farmer.fields.dateOfBirth")}{" "}
                  <span className="text-muted-foreground text-xs">({t("common.optional")})</span>
                </Label>
                <Input
                  id="dob"
                  type="date"
                  {...register("dateOfBirth")}
                  aria-invalid={!!errors.dateOfBirth}
                />
                {err("dateOfBirth")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nin">
                  {t("farmer.fields.nin")}{" "}
                  <span className="text-muted-foreground text-xs">({t("common.optional")})</span>
                </Label>
                <Input
                  id="nin"
                  autoCapitalize="characters"
                  {...register("nin")}
                  aria-invalid={!!errors.nin}
                />
                {err("nin")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="household">
                  {t("farmer.fields.householdSize")}{" "}
                  <span className="text-muted-foreground text-xs">({t("common.optional")})</span>
                </Label>
                <Input
                  id="household"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  {...register("householdSize")}
                />
              </div>
              <div className="flex flex-col justify-end gap-3">
                <Controller
                  control={control}
                  name="isHouseholdHead"
                  render={({ field }) => (
                    <Label className="flex min-h-11 items-center gap-3">
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />{" "}
                      {t("farmer.fields.isHouseholdHead")}
                    </Label>
                  )}
                />
                <Controller
                  control={control}
                  name="hasDisability"
                  render={({ field }) => (
                    <Label className="flex min-h-11 items-center gap-3">
                      <Switch checked={!!field.value} onCheckedChange={field.onChange} />{" "}
                      {t("farmer.fields.hasDisability")}
                    </Label>
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{t("farmer.fields.district")}</Label>
              <Controller
                control={control}
                name="districtId"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => {
                      field.onChange(v);
                      setValue("chiefdomId", "");
                    }}
                  >
                    <SelectTrigger
                      aria-invalid={!!errors.districtId}
                      aria-label={t("farmer.fields.district")}
                    >
                      <SelectValue placeholder={t("farmer.fields.district")} />
                    </SelectTrigger>
                    <SelectContent>
                      {reference.districts.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}{" "}
                          <span className="text-muted-foreground text-xs">· {d.region}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {err("districtId")}
            </div>
            <div className="space-y-2">
              <Label>{t("farmer.fields.chiefdom")}</Label>
              <Controller
                control={control}
                name="chiefdomId"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={!district}
                  >
                    <SelectTrigger
                      aria-invalid={!!errors.chiefdomId}
                      aria-label={t("farmer.fields.chiefdom")}
                    >
                      <SelectValue placeholder={t("farmer.fields.chiefdom")} />
                    </SelectTrigger>
                    <SelectContent>
                      {district?.chiefdoms.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {err("chiefdomId")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="community">{t("farmer.fields.community")}</Label>
              <Input id="community" {...register("community")} aria-invalid={!!errors.community} />
              {err("community")}
            </div>
            {reference.cooperatives.length > 1 ? (
              <div className="space-y-2">
                <Label>{t("farmer.fields.cooperative")}</Label>
                <Controller
                  control={control}
                  name="cooperativeId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "__none"}
                      onValueChange={(v) => field.onChange(v === "__none" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">{t("farmer.fields.noCooperative")}</SelectItem>
                        {reference.cooperatives.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ) : reference.cooperatives[0] ? (
              <p className="text-muted-foreground text-sm">
                {t("farmer.fields.cooperative")}:{" "}
                <span className="text-foreground font-medium">
                  {reference.cooperatives[0].name}
                </span>
              </p>
            ) : null}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t("farmer.fields.phone")}</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="076 123 456"
                {...register("phone")}
                aria-invalid={!!errors.phone}
              />
              {err("phone")}
            </div>
            <div className="space-y-2">
              <Label>{t("farmer.fields.walletProvider")}</Label>
              <Controller
                control={control}
                name="walletProvider"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value ?? "__none"}
                    onValueChange={(v) => field.onChange(v === "__none" ? null : v)}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {Object.values(MobileMoneyProvider).map((p) => (
                      <Label
                        key={p}
                        className="has-[[data-state=checked]]:border-primary flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3"
                      >
                        <RadioGroupItem value={p} /> {t(`providers.${p}`)}
                      </Label>
                    ))}
                    <Label className="text-muted-foreground has-[[data-state=checked]]:border-primary flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3">
                      <RadioGroupItem value="__none" /> —
                    </Label>
                  </RadioGroup>
                )}
              />
            </div>
            {values.walletProvider ? (
              <div className="space-y-2">
                <Label htmlFor="walletMsisdn">{t("farmer.fields.walletMsisdn")}</Label>
                <Input
                  id="walletMsisdn"
                  type="tel"
                  inputMode="tel"
                  {...register("walletMsisdn")}
                  aria-invalid={!!errors.walletMsisdn}
                />
                <p className="text-muted-foreground text-xs">
                  {t("farmer.fields.walletMsisdnHint")}
                </p>
                {err("walletMsisdn")}
              </div>
            ) : null}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{t("farmer.fields.crop")}</Label>
              <Controller
                control={control}
                name="cropId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      aria-invalid={!!errors.cropId}
                      aria-label={t("farmer.fields.crop")}
                    >
                      <SelectValue placeholder={t("farmer.fields.crop")} />
                    </SelectTrigger>
                    <SelectContent>
                      {reference.crops.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {err("cropId")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="size">{t("farmer.fields.sizeAcres")}</Label>
                <Input
                  id="size"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  {...register("sizeAcres")}
                  aria-invalid={!!errors.sizeAcres}
                />
                {err("sizeAcres")}
              </div>
              <div className="space-y-2">
                <Label>{t("farmer.fields.tenure")}</Label>
                <Controller
                  control={control}
                  name="tenure"
                  render={({ field }) => (
                    <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("common.optional")} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(LandTenure).map((tn) => (
                          <SelectItem key={tn} value={tn}>
                            {t(`tenure.${tn}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plotName">
                  {t("farmer.fields.plotName")}{" "}
                  <span className="text-muted-foreground text-xs">({t("common.optional")})</span>
                </Label>
                <Input id="plotName" {...register("plotName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="season">{t("farmer.fields.season")}</Label>
                <Input id="season" {...register("season")} aria-invalid={!!errors.season} />
                {err("season")}
              </div>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <Label>{t("farmer.fields.gps")}</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={captureGps}
                  disabled={gpsState.status === "busy"}
                >
                  {gpsState.status === "busy" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <LocateFixedIcon />
                  )}
                  {t("farmer.fields.captureGps")}
                </Button>
                {gpsState.message ? (
                  <span
                    className={
                      gpsState.status === "ok" ? "text-success text-sm" : "text-destructive text-sm"
                    }
                  >
                    {gpsState.message}
                  </span>
                ) : null}
              </div>
              {values.latitude != null && values.longitude != null ? (
                <p className="text-muted-foreground font-mono text-xs">
                  {values.latitude}, {values.longitude}
                </p>
              ) : null}
              {err("latitude")}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>
                {t("farmer.fields.photo")}{" "}
                <span className="text-muted-foreground text-xs">({t("common.optional")})</span>
              </Label>
              <div className="flex items-center gap-4">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="size-20 rounded-md border object-cover" />
                ) : (
                  <div className="text-muted-foreground flex size-20 items-center justify-center rounded-md border border-dashed">
                    <CameraIcon />
                  </div>
                )}
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <CameraIcon /> {t("farmer.fields.takePhoto")}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void onPhoto(e.target.files?.[0])}
                />
              </div>
            </div>
            <div className="bg-secondary/40 space-y-3 rounded-md border p-4">
              <p className="text-sm">{t("farmer.consentText")}</p>
              <Controller
                control={control}
                name="consentToRegister"
                render={({ field }) => (
                  <Label className="flex min-h-11 items-center gap-3 font-semibold">
                    <Checkbox
                      checked={field.value === true}
                      onCheckedChange={(v) => field.onChange(v === true)}
                      aria-invalid={!!errors.consentToRegister}
                    />
                    {t("farmer.consentLabel")}
                  </Label>
                )}
              />
              {err("consentToRegister")}
            </div>
          </div>
        )}

        {step === 5 && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              [t("farmer.fields.fullName"), values.fullName],
              [t("farmer.fields.gender"), values.gender ? t(`gender.${values.gender}`) : "—"],
              [
                t("farmer.fields.dateOfBirth"),
                values.dateOfBirth ? String(values.dateOfBirth) : "—",
              ],
              [t("farmer.fields.nin"), values.nin || "—"],
              [t("farmer.fields.district"), district?.name ?? "—"],
              [
                t("farmer.fields.chiefdom"),
                district?.chiefdoms.find((c) => c.id === values.chiefdomId)?.name ?? "—",
              ],
              [t("farmer.fields.community"), values.community],
              [
                t("farmer.fields.phone"),
                normalizeSlPhone(String(values.phone ?? ""))
                  ? formatSlPhone(normalizeSlPhone(String(values.phone))!)
                  : values.phone,
              ],
              [
                t("farmer.fields.walletProvider"),
                values.walletProvider ? t(`providers.${values.walletProvider}`) : "—",
              ],
              [
                t("farmer.fields.crop"),
                reference.crops.find((c) => c.id === values.cropId)?.name ?? "—",
              ],
              [t("farmer.fields.sizeAcres"), String(values.sizeAcres ?? "")],
              [
                t("farmer.fields.gps"),
                values.latitude != null ? `${values.latitude}, ${values.longitude}` : "—",
              ],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border p-3">
                <dt className="text-muted-foreground text-xs">{String(label)}</dt>
                <dd className="font-medium">{String(value ?? "—")}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
      <CardFooter className="flex justify-between gap-2 border-t">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || saving}
        >
          <ChevronLeftIcon /> {t("common.back")}
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={() => void next()}>
            {t("common.next")} <ChevronRightIcon />
          </Button>
        ) : (
          <Button type="button" onClick={() => void submit()} disabled={saving} size="lg">
            {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {t("farmer.saveOffline")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
