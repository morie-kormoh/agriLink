"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, MapPinIcon, PlusIcon } from "lucide-react";
import { BuyerType, MobileMoneyProvider } from "@agrilink/db/enums";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import { Switch } from "@agrilink/ui/components/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrilink/ui/components/select";
import { toast } from "@agrilink/ui/components/sonner";
import {
  createCollectionPointAction,
  setCollectionPointActiveAction,
  updateBuyerSettingsAction,
  updateCoopSettingsAction,
} from "@/app/actions/trade";

type Common = { approvalThresholdLe: string; fundingProvider: string; fundingAccount: string };

export function TradeSettingsForm({
  kind,
  initial,
  canManage,
}: {
  kind: "COOPERATIVE" | "BUYER";
  initial: Common & {
    duesPct?: string;
    duesFlatLe?: string;
    registrationNo?: string;
    type?: string;
  };
  canManage: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const common = {
        approvalThresholdLe: f.approvalThresholdLe || null,
        fundingProvider: (f.fundingProvider || null) as never,
        fundingAccount: f.fundingAccount || null,
      };
      const r =
        kind === "COOPERATIVE"
          ? await updateCoopSettingsAction({
              ...common,
              duesPct: f.duesPct || null,
              duesFlatLe: f.duesFlatLe || null,
              registrationNo: f.registrationNo || null,
            })
          : await updateBuyerSettingsAction({ ...common, type: (f.type ?? "AGGREGATOR") as never });
      if (!r.ok)
        return void toast.error(
          r.fieldErrors ? Object.values(r.fieldErrors).flat().join(" · ") : r.error,
        );
      toast.success(t("common.save"));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("trade.settingsTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canManage || pending} className="grid gap-4 sm:grid-cols-2">
          {kind === "COOPERATIVE" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="dues">{t("trade.dues")}</Label>
                <Input
                  id="dues"
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={f.duesPct ?? ""}
                  onChange={(e) => setF({ ...f, duesPct: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duesFlat">{t("trade.duesFlat")}</Label>
                <Input
                  id="duesFlat"
                  type="number"
                  min="0"
                  value={f.duesFlatLe ?? ""}
                  onChange={(e) => setF({ ...f, duesFlatLe: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regno">Registration no.</Label>
                <Input
                  id="regno"
                  value={f.registrationNo ?? ""}
                  onChange={(e) => setF({ ...f, registrationNo: e.target.value })}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>{t("trade.buyerType")}</Label>
              <Select value={f.type ?? "AGGREGATOR"} onValueChange={(v) => setF({ ...f, type: v })}>
                <SelectTrigger aria-label={t("trade.buyerType")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(BuyerType).map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="threshold">{t("trade.threshold")}</Label>
            <Input
              id="threshold"
              type="number"
              min="0"
              value={f.approvalThresholdLe}
              onChange={(e) => setF({ ...f, approvalThresholdLe: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("trade.fundingProvider")}</Label>
            <Select
              value={f.fundingProvider || "__none"}
              onValueChange={(v) => setF({ ...f, fundingProvider: v === "__none" ? "" : v })}
            >
              <SelectTrigger aria-label={t("trade.fundingProvider")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {Object.values(MobileMoneyProvider).map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`providers.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fundacct">{t("trade.fundingAccount")}</Label>
            <Input
              id="fundacct"
              value={f.fundingAccount}
              onChange={(e) => setF({ ...f, fundingAccount: e.target.value })}
            />
          </div>
          {canManage ? (
            <div className="sm:col-span-2">
              <Button onClick={save} disabled={pending}>
                {pending ? <Loader2Icon className="animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </div>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  );
}

export function CollectionPointsManager({
  points,
  canManage,
}: {
  points: { id: string; name: string; community: string; active: boolean }[];
  canManage: boolean;
}) {
  const t = useTranslations("trade");
  const router = useRouter();
  const [form, setForm] = useState({ name: "", community: "" });
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPinIcon className="size-4" /> {t("collectionPoints")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y">
          {points.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-muted-foreground">· {p.community}</span>
              </span>
              <Switch
                checked={p.active}
                disabled={!canManage || pending}
                aria-label={p.name}
                onCheckedChange={(v) =>
                  start(async () => {
                    const r = await setCollectionPointActiveAction(p.id, v);
                    if (!r.ok) return void toast.error(r.error);
                    router.refresh();
                  })
                }
              />
            </li>
          ))}
        </ul>
        {canManage ? (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createCollectionPointAction(form);
                if (!r.ok) return void toast.error(r.error);
                setForm({ name: "", community: "" });
                router.refresh();
              });
            }}
          >
            <Input
              placeholder={t("name")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              placeholder={t("community")}
              value={form.community}
              onChange={(e) => setForm({ ...form, community: e.target.value })}
              required
            />
            <Button type="submit" variant="outline" disabled={pending}>
              <PlusIcon /> {t("addCollectionPoint")}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
