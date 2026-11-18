"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CheckCircle2Icon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  SendIcon,
  TicketIcon,
} from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agripay/ui/components/card";
import { Input } from "@agripay/ui/components/input";
import { Label } from "@agripay/ui/components/label";
import { Checkbox } from "@agripay/ui/components/misc";
import { OtpInput } from "@agripay/ui/components/otp-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agripay/ui/components/select";
import { toast } from "@agripay/ui/components/sonner";
import { formatLe } from "@agripay/validation";
import {
  lookupVoucherAction,
  redeemVoucherAction,
  requestRedemptionOtpAction,
  saveDealerItemAction,
  saveDealerProfileAction,
  setDealerVerifiedAction,
} from "@/app/actions/finance";

interface Item {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitPriceLe: string;
}
interface Voucher {
  code: string;
  farmerName: string;
  agripayId: string;
  remainingLe: string;
  allowedCategories: string[];
  expiresAt: string;
  funder: string;
}

/** Counter flow: code → items → farmer's SMS code → done. */
export function RedeemFlow({ catalogue }: { catalogue: Item[] }) {
  const t = useTranslations();
  const [step, setStep] = useState<"code" | "items" | "otp" | "done">("code");
  const [code, setCode] = useState("");
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [otp, setOtp] = useState("");
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());
  const [receipt, setReceipt] = useState<{ ref: string; amountLe: string } | null>(null);
  const [pending, start] = useTransition();
  const allowed = useMemo(
    () =>
      catalogue.filter(
        (i) => !voucher?.allowedCategories.length || voucher.allowedCategories.includes(i.category),
      ),
    [catalogue, voucher],
  );
  const lines = allowed
    .filter((i) => (qty[i.id] ?? 0) > 0)
    .map((i) => ({ itemId: i.id, qty: qty[i.id]! }));
  const total = allowed.reduce((s, i) => s + Number(i.unitPriceLe) * (qty[i.id] ?? 0), 0);
  const over = voucher ? total > Number(voucher.remainingLe) : false;

  const reset = () => {
    setStep("code");
    setCode("");
    setVoucher(null);
    setQty({});
    setOtp("");
    setReceipt(null);
    setClientRef(crypto.randomUUID());
  };

  if (step === "done" && receipt) {
    return (
      <Card className="border-emerald-300">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2Icon className="size-12 text-emerald-600" />
          <p className="text-lg font-semibold">
            {t("dealer.redeemed", { amount: formatLe(receipt.amountLe), ref: receipt.ref })}
          </p>
          <Button onClick={reset}>
            <TicketIcon /> {t("dealer.newRedemption")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · {t("dealer.code")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await lookupVoucherAction(code);
                if (!r.ok) return void toast.error(r.error);
                setVoucher(r.data);
                setStep("items");
              });
            }}
          >
            <Input
              aria-label={t("dealer.code")}
              placeholder="K7P4-R2QX"
              className="w-48 font-mono text-lg tracking-widest uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={step !== "code"}
            />
            {step === "code" ? (
              <Button type="submit" disabled={pending || code.replace(/[-\s]/g, "").length !== 8}>
                {pending ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}{" "}
                {t("dealer.check")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={reset}>
                {t("common.cancel")}
              </Button>
            )}
          </form>
          {voucher ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs">{t("dealer.farmer")}</dt>
                <dd className="font-medium">
                  {voucher.farmerName} · {voucher.agripayId}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t("dealer.remaining")}</dt>
                <dd className="text-lg font-semibold">{formatLe(voucher.remainingLe)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t("dealer.allowed")}</dt>
                <dd>
                  {voucher.allowedCategories.length
                    ? voucher.allowedCategories
                        .map((c) => t(`inputCategory.${c}` as never))
                        .join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{voucher.funder}</dt>
                <dd>{new Date(voucher.expiresAt).toLocaleDateString("en-GB")}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {voucher ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2 · {t("dealer.items")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="divide-y">
              {allowed.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {t(`inputCategory.${i.category}` as never)} · {formatLe(i.unitPriceLe)} /{" "}
                      {i.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="−"
                      disabled={step !== "items" || !qty[i.id]}
                      onClick={() => setQty({ ...qty, [i.id]: Math.max(0, (qty[i.id] ?? 0) - 1) })}
                    >
                      <MinusIcon />
                    </Button>
                    <span className="w-8 text-center tabular-nums">{qty[i.id] ?? 0}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="+"
                      disabled={step !== "items"}
                      onClick={() => setQty({ ...qty, [i.id]: (qty[i.id] ?? 0) + 1 })}
                    >
                      <PlusIcon />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <p className={`text-lg font-semibold ${over ? "text-destructive" : ""}`}>
                {t("dealer.total")}: {formatLe(total.toFixed(2))}
              </p>
              {step === "items" ? (
                <Button
                  disabled={pending || !lines.length || over}
                  onClick={() =>
                    start(async () => {
                      const r = await requestRedemptionOtpAction(voucher.code, lines);
                      if (!r.ok) return void toast.error(r.error);
                      setStep("otp");
                    })
                  }
                >
                  {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}{" "}
                  {t("dealer.sendCode")}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "otp" && voucher ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3 · {t("dealer.otp")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <OtpInput value={otp} onChange={setOtp} />
            <Button
              disabled={pending || otp.length !== 6}
              onClick={() =>
                start(async () => {
                  const r = await redeemVoucherAction(voucher.code, lines, otp, clientRef);
                  if (!r.ok) {
                    setOtp("");
                    return void toast.error(r.error);
                  }
                  setReceipt(r.data);
                  setStep("done");
                })
              }
            >
              {pending ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />}{" "}
              {t("dealer.confirm")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function CatalogueForm({ item }: { item?: Item & { active: boolean } }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    name: item?.name ?? "",
    category: item?.category ?? "FERTILISER",
    unit: item?.unit ?? "bag",
    unitPriceLe: item?.unitPriceLe ?? "",
    active: item?.active ?? true,
  });
  return (
    <form
      className="grid gap-2 sm:grid-cols-[2fr_1fr_6rem_7rem_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveDealerItemAction({ ...f, category: f.category as "SEED" }, item?.id);
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("common.save"));
          if (!item) setF({ ...f, name: "", unitPriceLe: "" });
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        {item ? null : <Label htmlFor="ci-name">{t("dealer.item")}</Label>}
        <Input
          id={item ? undefined : "ci-name"}
          aria-label={t("dealer.item")}
          required
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        {item ? null : <Label>{t("dealer.category")}</Label>}
        <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
          <SelectTrigger aria-label={t("dealer.category")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["SEED", "FERTILISER", "AGROCHEM", "TOOLS"].map((c) => (
              <SelectItem key={c} value={c}>
                {t(`inputCategory.${c}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        {item ? null : <Label htmlFor="ci-unit">{t("dealer.unit")}</Label>}
        <Input
          id={item ? undefined : "ci-unit"}
          aria-label={t("dealer.unit")}
          value={f.unit}
          onChange={(e) => setF({ ...f, unit: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        {item ? null : <Label htmlFor="ci-price">{t("dealer.price")}</Label>}
        <Input
          id={item ? undefined : "ci-price"}
          aria-label={t("dealer.price")}
          type="number"
          min="0.01"
          step="0.01"
          required
          value={f.unitPriceLe}
          onChange={(e) => setF({ ...f, unitPriceLe: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-1.5 pb-2 text-sm">
        <Checkbox checked={f.active} onCheckedChange={(c) => setF({ ...f, active: c === true })} />{" "}
        ✓
      </label>
      <Button type="submit" size="sm" variant={item ? "outline" : "default"} disabled={pending}>
        {item ? <SaveIcon /> : <PlusIcon />} {item ? t("common.save") : t("dealer.addItem")}
      </Button>
    </form>
  );
}

export function DealerProfileForm({
  initial,
  districts,
}: {
  initial: { districtId: string; payoutMsisdn: string; payoutProvider: string };
  districts: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState(initial);
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveDealerProfileAction({
            ...f,
            payoutProvider: f.payoutProvider as "ORANGE_MONEY",
          });
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("common.save"));
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label>{t("dealer.district")}</Label>
        <Select value={f.districtId} onValueChange={(v) => setF({ ...f, districtId: v })}>
          <SelectTrigger aria-label={t("dealer.district")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {districts.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="dp-msisdn">{t("dealer.payoutMsisdn")}</Label>
        <Input
          id="dp-msisdn"
          required
          inputMode="tel"
          value={f.payoutMsisdn}
          onChange={(e) => setF({ ...f, payoutMsisdn: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>{t("dealer.payoutProvider")}</Label>
        <Select value={f.payoutProvider} onValueChange={(v) => setF({ ...f, payoutProvider: v })}>
          <SelectTrigger aria-label={t("dealer.payoutProvider")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["ORANGE_MONEY", "AFRIMONEY", "QMONEY"].map((p) => (
              <SelectItem key={p} value={p}>
                {t(`providers.${p}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-3">
        <p className="text-muted-foreground mb-2 text-xs">{t("dealer.reverify")}</p>
        <Button type="submit" disabled={pending}>
          <SaveIcon /> {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

export function VerifyDealerButton({ id, verified }: { id: string; verified: boolean }) {
  const t = useTranslations("adminDealers");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={verified ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setDealerVerifiedAction(id, !verified);
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        })
      }
    >
      {verified ? t("unverify") : t("verify")}
    </Button>
  );
}

export function NeedProfile() {
  const t = useTranslations("dealer");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile")}</CardTitle>
        <CardDescription>{t("completeProfile")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
