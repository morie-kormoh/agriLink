"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  ScaleIcon,
  SearchIcon,
  TriangleAlertIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@agripay/ui/components/badge";
import { Button } from "@agripay/ui/components/button";
import { Card, CardContent, CardFooter } from "@agripay/ui/components/card";
import { Input } from "@agripay/ui/components/input";
import { Label } from "@agripay/ui/components/label";
import { Alert, AlertDescription } from "@agripay/ui/components/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agripay/ui/components/select";
import { toast } from "@agripay/ui/components/sonner";
import { DEDUCTION_TYPES, Decimal, formatLe } from "@agripay/validation";
import { findFarmersAction, recordPurchaseAction } from "@/app/actions/trade";

type FarmerHit = {
  id: string;
  agripayId: string;
  fullName: string;
  community: string;
  phone: string;
  hasWallet: boolean;
  status: string;
};
type Price = { cropId: string; grade: string | null; unit: string; priceLe: string };
type Deduction = { type: (typeof DEDUCTION_TYPES)[number]; amountLe: string; note?: string };

export function PurchaseForm({
  crops,
  prices,
  collectionPoints,
  isBuyer,
  basePath,
  initialFarmer,
}: {
  crops: { id: string; name: string }[];
  prices: Price[];
  collectionPoints: { id: string; name: string }[];
  isBuyer: boolean;
  basePath: string;
  initialFarmer?: FarmerHit | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [farmer, setFarmer] = useState<FarmerHit | null>(initialFarmer ?? null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FarmerHit[]>([]);
  const [searching, startSearch] = useTransition();
  const [cropId, setCropId] = useState(crops[0]?.id ?? "");
  const [grade, setGrade] = useState("");
  const [unit, setUnit] = useState<"kg" | "bag" | "tonne">("kg");
  const [quantity, setQuantity] = useState("");
  const [bags, setBags] = useState("");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [collectionPointId, setCollectionPointId] = useState(collectionPoints[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ ref: string; net: string; batchId: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const listPrice = useMemo(
    () =>
      prices.find((p) => p.cropId === cropId && p.grade === (grade || null)) ??
      prices.find((p) => p.cropId === cropId && p.grade === null),
    [prices, cropId, grade],
  );
  useEffect(() => {
    if (listPrice) setUnit(listPrice.unit as typeof unit);
  }, [listPrice]);

  const effectivePrice = price || listPrice?.priceLe || "";
  const overridden = !!price && (!listPrice || !new Decimal(price || 0).equals(listPrice.priceLe));
  const totals = useMemo(() => {
    try {
      const gross = new Decimal(quantity || 0).mul(effectivePrice || 0).toDecimalPlaces(2);
      const ded = deductions.reduce((s, d) => s.plus(d.amountLe || 0), new Decimal(0));
      return { gross, ded, net: gross.minus(ded) };
    } catch {
      return null;
    }
  }, [quantity, effectivePrice, deductions]);

  useEffect(() => {
    if (farmer || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = setTimeout(
      () =>
        startSearch(async () => {
          const res = await findFarmersAction(q);
          if (res.ok) setHits(res.data);
        }),
      300,
    );
    return () => clearTimeout(id);
  }, [q, farmer]);

  function reset(keepFarmer = false) {
    if (!keepFarmer) {
      setFarmer(null);
      setQ("");
    }
    setQuantity("");
    setBags("");
    setPrice("");
    setReason("");
    setDeductions([]);
    setError(null);
  }

  function save(next: boolean) {
    if (!farmer) return setError(t("trade.findFarmer"));
    setError(null);
    startSaving(async () => {
      const res = await recordPurchaseAction({
        clientRef: crypto.randomUUID(),
        farmerId: farmer.id,
        cropId,
        grade: grade || null,
        quantity: quantity as unknown as number,
        unit,
        bags: bags ? (bags as unknown as number) : null,
        unitPriceLe: price || null,
        priceOverrideReason: reason || null,
        deductions: deductions.filter((d) => d.amountLe),
        collectionPointId: collectionPointId || null,
      });
      if (!res.ok) {
        setError(res.fieldErrors ? Object.values(res.fieldErrors).flat().join(" · ") : res.error);
        return;
      }
      const p = res.data.purchase;
      toast.success(t("trade.saved", { ref: p.ref, net: formatLe(p.netLe) }));
      if (res.data.warnings.includes("NO_WALLET")) toast.warning(t("trade.noWallet"));
      setLast({ ref: p.ref, net: p.netLe, batchId: p.batchId });
      reset(false);
      router.refresh();
      if (next) setTimeout(() => searchRef.current?.focus(), 50);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5">
          {/* Farmer */}
          <div className="space-y-2">
            <Label htmlFor="farmer-search">{t("trade.farmer")}</Label>
            {farmer ? (
              <div className="bg-secondary/40 flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <UserRoundIcon className="text-primary size-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{farmer.fullName}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {farmer.agripayId} · {farmer.community} · {farmer.phone}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => reset(false)}>
                  <XIcon /> {t("trade.change")}
                </Button>
              </div>
            ) : (
              <div className="relative">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  ref={searchRef}
                  id="farmer-search"
                  autoFocus
                  autoComplete="off"
                  className="pl-9"
                  placeholder={isBuyer ? t("trade.findFarmerBuyer") : t("trade.findFarmer")}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {searching ? (
                  <Loader2Icon className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
                ) : null}
                {hits.length ? (
                  <ul
                    className="bg-popover absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border shadow-md"
                    role="listbox"
                  >
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="hover:bg-accent/40 flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm"
                          onClick={() => {
                            setFarmer(h);
                            setHits([]);
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{h.fullName}</span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {h.agripayId} · {h.community}
                            </span>
                          </span>
                          {!h.hasWallet ? <Badge variant="warning">no wallet</Badge> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            {farmer && !farmer.hasWallet ? (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertDescription>{t("trade.noWallet")}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          {/* Crop & weight */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("trade.crop")}</Label>
              <Select value={cropId} onValueChange={setCropId}>
                <SelectTrigger aria-label={t("trade.crop")}>
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
            <div className="space-y-2">
              <Label htmlFor="grade">
                {t("trade.grade")}{" "}
                <span className="text-muted-foreground text-xs">({t("common.optional")})</span>
              </Label>
              <Input
                id="grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value.toUpperCase())}
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qty">{t("trade.quantity")}</Label>
              <div className="flex gap-2">
                <Input
                  id="qty"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="text-lg"
                />
                <Select value={unit} onValueChange={(v) => setUnit(v as typeof unit)}>
                  <SelectTrigger className="w-28" aria-label={t("trade.unit")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="bag">bag</SelectItem>
                    <SelectItem value="tonne">tonne</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bags">
                {t("trade.bags")}{" "}
                <span className="text-muted-foreground text-xs">({t("common.optional")})</span>
              </Label>
              <Input
                id="bags"
                type="number"
                inputMode="numeric"
                min="0"
                value={bags}
                onChange={(e) => setBags(e.target.value)}
              />
            </div>
          </div>

          {/* Price */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price">{t("trade.price", { unit })}</Label>
              <Input
                id="price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder={listPrice?.priceLe ?? ""}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {listPrice
                  ? t("trade.listPrice", {
                      price: `${formatLe(listPrice.priceLe)}/${listPrice.unit}`,
                    })
                  : t("trade.noListPrice")}
              </p>
            </div>
            {overridden && listPrice ? (
              <div className="space-y-2">
                <Label htmlFor="reason">{t("trade.overrideReason")}</Label>
                <Input
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
                />
              </div>
            ) : null}
          </div>

          {/* Deductions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("trade.deductions")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeductions((d) => [...d, { type: "TRANSPORT", amountLe: "" }])}
              >
                <PlusIcon /> {t("trade.addDeduction")}
              </Button>
            </div>
            {deductions.map((d, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_1fr_auto] gap-2">
                <Select
                  value={d.type}
                  onValueChange={(v) =>
                    setDeductions((all) =>
                      all.map((x, j) => (j === i ? { ...x, type: v as Deduction["type"] } : x)),
                    )
                  }
                >
                  <SelectTrigger aria-label={t("trade.deductions")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEDUCTION_TYPES.map((dt) => (
                      <SelectItem key={dt} value={dt}>
                        {t(`trade.deductionType.${dt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Le"
                  value={d.amountLe}
                  onChange={(e) =>
                    setDeductions((all) =>
                      all.map((x, j) => (j === i ? { ...x, amountLe: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  placeholder="…"
                  value={d.note ?? ""}
                  onChange={(e) =>
                    setDeductions((all) =>
                      all.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove"
                  onClick={() => setDeductions((all) => all.filter((_, j) => j !== i))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </div>

          {collectionPoints.length ? (
            <div className="space-y-2">
              <Label>{t("trade.collectionPoint")}</Label>
              <Select
                value={collectionPointId || "__none"}
                onValueChange={(v) => setCollectionPointId(v === "__none" ? "" : v)}
              >
                <SelectTrigger aria-label={t("trade.collectionPoint")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("trade.noCollectionPoint")}</SelectItem>
                  {collectionPoints.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {/* Totals */}
          <div className="bg-secondary/40 grid grid-cols-3 gap-3 rounded-lg border p-4 text-center">
            <div>
              <p className="text-muted-foreground text-xs">{t("trade.gross")}</p>
              <p className="font-semibold tabular-nums">
                {totals ? formatLe(totals.gross.toString()) : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("trade.deductions")}</p>
              <p className="font-semibold tabular-nums">
                {totals ? formatLe(totals.ded.toString()) : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("trade.net")}</p>
              <p className="text-primary text-lg font-bold tabular-nums">
                {totals ? formatLe(totals.net.toString()) : "—"}
              </p>
            </div>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2 border-t">
          <Button variant="outline" disabled={saving} onClick={() => save(false)}>
            <SaveIcon /> {t("trade.save")}
          </Button>
          <Button size="lg" disabled={saving} onClick={() => save(true)}>
            {saving ? <Loader2Icon className="animate-spin" /> : <ScaleIcon />}
            {t("trade.saveNext")}
          </Button>
        </CardFooter>
      </Card>
      {last ? (
        <p className="text-muted-foreground text-sm">
          {t("trade.saved", { ref: last.ref, net: formatLe(last.net) })} ·{" "}
          <Link className="text-primary font-medium underline" href={`${basePath}/${last.batchId}`}>
            {t("trade.viewBatch")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
