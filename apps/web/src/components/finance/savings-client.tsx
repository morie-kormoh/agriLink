"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  PauseIcon,
  PiggyBankIcon,
  PlayIcon,
  SirenIcon,
  SlidersHorizontalIcon,
  TargetIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agrilink/ui/components/card";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import { Progress } from "@agrilink/ui/components/misc";
import { autoSavePreview } from "@agrilink/finance";
import { formatLe } from "@agrilink/validation";
import {
  earlyWithdrawalAction,
  openGoalAction,
  openHarvestLockAction,
  previewEarlyWithdrawalAction,
  updateAutoSaveAction,
} from "@/app/actions/finance";
import { PinConfirm } from "./pin-confirm";

export interface AccountView {
  id: string;
  ref: string;
  type: "HARVEST_LOCK" | "GOAL" | "GROUP";
  productName: string;
  custodian: string;
  status: string;
  balanceLe: string;
  availableLe: string;
  pct: number | null;
  paused: boolean;
  goalLe: string | null;
  goalLabel: string | null;
  lockedUntil: string | null;
  minPct: number;
  maxPct: number;
  earlyAllowed: boolean;
  earlyFeePct: string | null;
  earlyUsed: boolean;
  interestNote: string | null;
}

export function AccountCard({ a, assisted }: { a: AccountView; assisted: boolean }) {
  const t = useTranslations("savings");
  const [pct, setPct] = useState(String(a.pct ?? a.minPct));
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{ feeLe: string; netLe: string } | null>(null);
  const [ewOpen, setEwOpen] = useState(false);
  const [quoting, startQuote] = useTransition();
  const days = a.lockedUntil
    ? Math.max(0, Math.ceil((new Date(a.lockedUntil).getTime() - Date.now()) / 86_400_000))
    : null;
  const goalPct = a.goalLe ? Math.min(100, (Number(a.balanceLe) / Number(a.goalLe)) * 100) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {a.type === "HARVEST_LOCK" ? (
            <PiggyBankIcon className="text-primary size-4" />
          ) : (
            <TargetIcon className="text-primary size-4" />
          )}
          {a.type === "GOAL" ? a.goalLabel : t("harvestLock")}
          <span className="text-muted-foreground ml-auto text-xs font-normal">{a.ref}</span>
        </CardTitle>
        <CardDescription>
          {a.productName} · {t("custodian", { name: a.custodian })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs">{t("balance")}</p>
            <p className="text-3xl font-semibold tabular-nums">{formatLe(a.balanceLe)}</p>
            {a.availableLe !== a.balanceLe ? (
              <p className="text-muted-foreground text-xs">
                {t("available")}: {formatLe(a.availableLe)}
              </p>
            ) : null}
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">
              {a.paused ? t("paused") : `${a.pct}%`}{" "}
              {!a.paused ? <span className="text-muted-foreground">· {t("active")}</span> : null}
            </p>
            {a.lockedUntil ? (
              <p className="text-muted-foreground">
                {t("unlocks", {
                  date: new Date(a.lockedUntil).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }),
                })}{" "}
                · {t("unlocksIn", { days: days ?? 0 })}
              </p>
            ) : null}
          </div>
        </div>
        {goalPct != null ? (
          <div className="space-y-1">
            <Progress value={goalPct} />
            <p className="text-muted-foreground text-xs">
              {goalPct >= 100
                ? t("goalReached")
                : t("goalProgress", { saved: formatLe(a.balanceLe), goal: formatLe(a.goalLe!) })}
            </p>
          </div>
        ) : null}
        {a.interestNote ? (
          <p className="text-muted-foreground text-xs">
            {t("interest")}: {a.interestNote}
          </p>
        ) : null}
        {a.status === "ACTIVE" ? (
          <div className="flex flex-wrap gap-2">
            <PinConfirm
              label={a.paused ? t("resume") : t("pause")}
              icon={a.paused ? <PlayIcon /> : <PauseIcon />}
              variant="outline"
              size="sm"
              title={a.paused ? t("resume") : t("pause")}
              assisted={assisted}
              action={updateAutoSaveAction.bind(null, a.id, { paused: !a.paused })}
              successMessage={t("updated")}
            />
            <PinConfirm
              label={t("changePct")}
              icon={<SlidersHorizontalIcon />}
              variant="outline"
              size="sm"
              title={t("changePct")}
              assisted={assisted}
              action={(pin) => updateAutoSaveAction(a.id, { pct: Number(pct) }, pin)}
              successMessage={t("updated")}
            >
              <PctPicker value={pct} onChange={setPct} min={a.minPct} max={a.maxPct} />
            </PinConfirm>
            {a.earlyAllowed ? (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`ew-${a.id}`} className="text-xs">
                    {t("earlyWithdrawal")}
                  </Label>
                  <Input
                    id={`ew-${a.id}`}
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.01"
                    className="h-8 w-28"
                    placeholder={t("amount")}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={a.earlyUsed}
                  />
                </div>
                <PinConfirm
                  label={t("withdraw")}
                  icon={<SirenIcon />}
                  size="sm"
                  variant="secondary"
                  disabled={a.earlyUsed || !amount || quoting}
                  open={ewOpen}
                  onOpenChange={(o) => {
                    if (o) {
                      startQuote(async () => {
                        const r = await previewEarlyWithdrawalAction(a.id, amount);
                        if (r.ok && r.data) setQuote({ feeLe: r.data.feeLe, netLe: r.data.netLe });
                        setEwOpen(true);
                      });
                    } else setEwOpen(false);
                  }}
                  title={t("earlyWithdrawal")}
                  description={t("earlyBody")}
                  assisted={assisted}
                  action={earlyWithdrawalAction.bind(null, a.id, amount)}
                  successMessage={
                    quote ? t("withdrawn", { amount: formatLe(quote.netLe) }) : undefined
                  }
                >
                  {quote ? (
                    <dl className="bg-muted grid grid-cols-3 gap-2 rounded-lg p-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground text-xs">{t("amount")}</dt>
                        <dd className="font-medium">{amount ? formatLe(amount) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">{t("fee")}</dt>
                        <dd className="font-medium">{formatLe(quote.feeLe)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">{t("youReceive")}</dt>
                        <dd className="font-semibold">{formatLe(quote.netLe)}</dd>
                      </div>
                    </dl>
                  ) : null}
                </PinConfirm>
              </div>
            ) : null}
          </div>
        ) : null}
        {a.earlyUsed ? <p className="text-muted-foreground text-xs">{t("earlyUsed")}</p> : null}
      </CardContent>
    </Card>
  );
}

function PctPicker({
  value,
  onChange,
  min,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
}) {
  const t = useTranslations("savings");
  return (
    <div className="space-y-2">
      <Label htmlFor="pct-range">{t("pct")}</Label>
      <div className="flex items-center gap-3">
        <input
          id="pct-range"
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="accent-primary flex-1"
        />
        <span className="w-12 text-right font-semibold tabular-nums">{value}%</span>
      </div>
      <p className="text-muted-foreground text-sm">
        {t("preview", { sale: formatLe("5000"), saved: formatLe(autoSavePreview("5000", value)) })}
      </p>
    </div>
  );
}

export interface ProductView {
  id: string;
  name: string;
  type: "HARVEST_LOCK" | "GOAL" | "GROUP";
  custodian: string;
  defaultPct: number;
  minPct: number;
  maxPct: number;
  releaseMonthDay: string | null;
  interestNote: string | null;
}

export function OpenSavings({
  farmerId,
  products,
  assisted,
}: {
  farmerId: string;
  products: ProductView[];
  assisted: boolean;
}) {
  const t = useTranslations("savings");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {products.map((p) => (
        <OpenProductCard key={p.id} farmerId={farmerId} p={p} assisted={assisted} t={t} />
      ))}
    </div>
  );
}

function OpenProductCard({
  farmerId,
  p,
  assisted,
  t,
}: {
  farmerId: string;
  p: ProductView;
  assisted: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [pct, setPct] = useState(String(p.defaultPct || p.minPct));
  const [goalLabel, setGoalLabel] = useState("");
  const [goalLe, setGoalLe] = useState("");
  const isLock = p.type === "HARVEST_LOCK";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isLock ? (
            <PiggyBankIcon className="text-primary size-4" />
          ) : (
            <TargetIcon className="text-primary size-4" />
          )}{" "}
          {p.name}
        </CardTitle>
        <CardDescription>
          {isLock ? t("harvestLockBody") : t("openGoal")} · {t("custodian", { name: p.custodian })}
          {p.releaseMonthDay ? ` · ${t("releaseRule")}: ${p.releaseMonthDay}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isLock ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`gl-${p.id}`}>{t("goalLabel")}</Label>
              <Input
                id={`gl-${p.id}`}
                value={goalLabel}
                onChange={(e) => setGoalLabel(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ga-${p.id}`}>{t("goalAmount")}</Label>
              <Input
                id={`ga-${p.id}`}
                type="number"
                inputMode="decimal"
                min="1"
                value={goalLe}
                onChange={(e) => setGoalLe(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        <PctPicker value={pct} onChange={setPct} min={p.minPct} max={p.maxPct} />
        {p.interestNote ? (
          <p className="text-muted-foreground text-xs">
            {t("interest")}: {p.interestNote}
          </p>
        ) : null}
        <PinConfirm
          label={isLock ? t("openLock") : t("openGoal")}
          title={isLock ? t("openLock") : t("openGoal")}
          description={t("preview", {
            sale: formatLe("5000"),
            saved: formatLe(autoSavePreview("5000", pct)),
          })}
          assisted={assisted}
          disabled={!isLock && (!goalLabel || !goalLe)}
          action={(pin) =>
            isLock
              ? openHarvestLockAction(farmerId, p.id, Number(pct), pin)
              : openGoalAction(
                  farmerId,
                  { productId: p.id, goalLabel, goalLe, pct: Number(pct) },
                  pin,
                )
          }
          successMessage={t("opened")}
        />
      </CardContent>
    </Card>
  );
}
