"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BadgeCheckIcon,
  BeanIcon,
  CoinsIcon,
  HammerIcon,
  Loader2Icon,
  PackageIcon,
  ShovelIcon,
  SproutIcon,
  Trash2Icon,
  TruckIcon,
  UsersIcon,
  WheatIcon,
} from "lucide-react";
import { Badge } from "@agrilink/ui/components/badge";
import { Button } from "@agrilink/ui/components/button";
import { StatCard } from "@agrilink/ui/components/blocks";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@agrilink/ui/components/dialog";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import { Progress } from "@agrilink/ui/components/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrilink/ui/components/select";
import { toast } from "@agrilink/ui/components/sonner";
import { formatLe } from "@agrilink/validation";
import { addRecordAction, deleteRecordAction } from "@/app/actions/records";

type RecordType =
  | "INPUT_PURCHASE"
  | "LABOUR"
  | "LAND_PREP"
  | "TRANSPORT"
  | "OTHER_COST"
  | "HARVEST"
  | "SALE"
  | "OTHER_INCOME";

const QUICK: { type: RecordType; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "INPUT_PURCHASE", icon: BeanIcon },
  { type: "LABOUR", icon: UsersIcon },
  { type: "LAND_PREP", icon: ShovelIcon },
  { type: "TRANSPORT", icon: TruckIcon },
  { type: "HARVEST", icon: WheatIcon },
  { type: "SALE", icon: CoinsIcon },
  { type: "OTHER_COST", icon: HammerIcon },
  { type: "OTHER_INCOME", icon: PackageIcon },
];
const COSTS = new Set<RecordType>([
  "INPUT_PURCHASE",
  "LABOUR",
  "LAND_PREP",
  "TRANSPORT",
  "OTHER_COST",
]);

export interface RecordRow {
  id: string;
  type: RecordType;
  description: string | null;
  amountLe: string | null;
  quantity: string | null;
  unit: string | null;
  occurredAt: string;
  verification: "SELF_REPORTED" | "AGENT_CONFIRMED" | "SYSTEM_VERIFIED";
  editable: boolean;
}

export function RecordsPanel({
  farmerId,
  season,
  seasons,
  records,
  totals,
  crops,
  canAdd,
}: {
  farmerId: string;
  season: string;
  seasons: string[];
  records: RecordRow[];
  totals: {
    totalCostLe: string;
    totalSalesLe: string;
    netLe: string;
    harvestKg: string;
    verifiedShare: number;
    byType: Record<string, string>;
  };
  crops: { id: string; name: string }[];
  canAdd: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState<RecordType | null>(null);
  const [form, setForm] = useState({
    amountLe: "",
    quantity: "",
    unit: "kg",
    description: "",
    cropId: crops[0]?.id ?? "",
    occurredAt: new Date().toISOString().slice(0, 10),
  });
  const [pending, start] = useTransition();
  const maxCost = Math.max(
    1,
    ...Object.entries(totals.byType)
      .filter(([k]) => COSTS.has(k as RecordType))
      .map(([, v]) => Number(v)),
  );

  function submit() {
    if (!adding) return;
    start(async () => {
      const r = await addRecordAction(farmerId, {
        type: adding,
        season,
        amountLe: adding === "HARVEST" ? null : form.amountLe,
        quantity: adding === "HARVEST" || adding === "SALE" ? form.quantity || null : null,
        unit: adding === "HARVEST" || adding === "SALE" ? form.unit : null,
        description: form.description || null,
        cropId: adding === "HARVEST" || adding === "SALE" ? form.cropId : null,
        occurredAt: new Date(`${form.occurredAt}T12:00:00Z`),
      });
      if (!r.ok)
        return void toast.error(
          r.fieldErrors ? Object.values(r.fieldErrors).flat().join(" · ") : r.error,
        );
      toast.success(t("records.saved"));
      setAdding(null);
      setForm((f) => ({ ...f, amountLe: "", quantity: "", description: "" }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Label>{t("records.season")}</Label>
        <Select value={season} onValueChange={(v) => router.replace(`${pathname}?season=${v}`)}>
          <SelectTrigger className="w-40" aria-label={t("records.season")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="success">
          <BadgeCheckIcon /> {t("records.verifiedShare", { pct: Math.round(totals.verifiedShare) })}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label={t("records.spent")} value={formatLe(totals.totalCostLe)} />
        <StatCard label={t("records.sold")} value={formatLe(totals.totalSalesLe)} />
        <StatCard
          label={t("records.net")}
          value={
            <span className={Number(totals.netLe) < 0 ? "text-destructive" : "text-primary"}>
              {formatLe(totals.netLe)}
            </span>
          }
        />
        <StatCard
          label={t("records.harvest")}
          value={`${Number(totals.harvestKg).toLocaleString("en")} kg`}
          icon={SproutIcon}
        />
      </div>

      {Object.keys(totals.byType).some((k) => COSTS.has(k as RecordType)) ? (
        <div className="bg-card space-y-2 rounded-xl border p-4">
          {Object.entries(totals.byType)
            .filter(([k]) => COSTS.has(k as RecordType))
            .map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3 text-sm">
                <span>{t(`recordType.${k}`)}</span>
                <Progress value={(Number(v) / maxCost) * 100} />
                <span className="text-right tabular-nums">{formatLe(v)}</span>
              </div>
            ))}
        </div>
      ) : null}

      {canAdd ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {QUICK.map(({ type, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => setAdding(type)}
              className="bg-card hover:border-primary hover:bg-secondary/40 flex flex-col items-center gap-1 rounded-lg border p-3 text-center text-xs"
            >
              <Icon className="text-primary size-5" />
              {t(`recordType.${type}`)}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="bg-card divide-y rounded-xl border">
        {records.length === 0 ? (
          <li className="text-muted-foreground p-6 text-center text-sm">{t("records.none")}</li>
        ) : null}
        {records.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="font-medium">
                {t(`recordType.${r.type}`)}
                {r.amountLe ? ` · ${formatLe(r.amountLe)}` : ""}
                {r.quantity ? ` · ${Number(r.quantity).toLocaleString("en")} ${r.unit ?? ""}` : ""}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {new Date(r.occurredAt).toLocaleDateString("en-GB")}
                {r.description ? ` · ${r.description}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge
                variant={
                  r.verification === "SYSTEM_VERIFIED"
                    ? "success"
                    : r.verification === "AGENT_CONFIRMED"
                      ? "info"
                      : "muted"
                }
              >
                {t(`verification.${r.verification}`)}
              </Badge>
              {r.editable ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("records.delete")}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteRecordAction(r.id);
                      if (!res.ok) return void toast.error(res.error);
                      toast.success(t("records.deleted"));
                      router.refresh();
                    })
                  }
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adding ? t("records.addTitle", { type: t(`recordType.${adding}`) }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {adding === "HARVEST" || adding === "SALE" ? (
              <>
                <div className="space-y-2">
                  <Label>{t("records.crop")}</Label>
                  <Select
                    value={form.cropId}
                    onValueChange={(v) => setForm({ ...form, cropId: v })}
                  >
                    <SelectTrigger aria-label={t("records.crop")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {crops.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="rqty">{t("records.quantity")}</Label>
                    <Input
                      id="rqty"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("records.unit")}</Label>
                    <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                      <SelectTrigger aria-label={t("records.unit")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="bag">{t("units.bag")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : null}
            {adding !== "HARVEST" ? (
              <div className="space-y-2">
                <Label htmlFor="ramt">{t("records.amount")}</Label>
                <Input
                  id="ramt"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={form.amountLe}
                  onChange={(e) => setForm({ ...form, amountLe: e.target.value })}
                  autoFocus
                />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="rdate">{t("records.date")}</Label>
                <Input
                  id="rdate"
                  type="date"
                  value={form.occurredAt}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rnote">{t("records.description")}</Label>
                <Input
                  id="rnote"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
