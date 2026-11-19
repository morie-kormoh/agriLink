"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CheckIcon,
  FileTextIcon,
  HandCoinsIcon,
  Loader2Icon,
  SaveIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@agrilink/ui/components/dialog";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import { Checkbox } from "@agrilink/ui/components/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrilink/ui/components/select";
import { toast } from "@agrilink/ui/components/sonner";
import { Textarea } from "@agrilink/ui/components/textarea";
import {
  approveLoanAction,
  createSavingsProductAction,
  declineLoanAction,
  disclosureAction,
  makeOfferAction,
  manualRepaymentAction,
  markDefaultAction,
  proposeRestructureAction,
  reconcileSavingsAction,
  requestConsentAction,
  saveLoanProductAction,
  toggleSavingsProductAction,
  updateInstitutionAction,
} from "@/app/actions/finance";
import { Terms } from "@/components/finance/loans-client";

type R = { ok: true; data?: unknown } | { ok: false; error: string };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (
    fn: () => Promise<R>,
    ok: string | ((d: unknown) => string),
    after?: (d: unknown) => void,
  ) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(typeof ok === "function" ? ok(r.data) : ok);
      after?.(r.data);
      router.refresh();
    });
  return { pending, go, router };
}

function F({
  id,
  label,
  children,
  className,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Pick({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <F label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </F>
  );
}

function Multi({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={value.includes(o.value)}
              onCheckedChange={(c) =>
                onChange(c === true ? [...value, o.value] : value.filter((v) => v !== o.value))
              }
            />{" "}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Loan products
// ---------------------------------------------------------------------------

export interface ProductFormValue {
  name: string;
  description: string;
  minAmountLe: string;
  firstCycleMaxLe: string;
  maxAmountLe: string;
  graduationPct: string;
  flatFeePct: string;
  minBand: string;
  maxDebtToIncomePct: string;
  maxRepaymentPctPerSale: string;
  dueMonthDay: string;
  voucherValidDays: string;
  allowedCategories: string[];
  eligibleDealerIds: string[];
  cropIds: string[];
  districtIds: string[];
  requiresGroupGuarantee: boolean;
  active: boolean;
}

export function ProductForm({
  id,
  initial,
  crops,
  districts,
  dealers,
}: {
  id?: string;
  initial: ProductFormValue;
  crops: { id: string; name: string }[];
  districts: { id: string; name: string }[];
  dealers: { id: string; name: string }[];
}) {
  const t = useTranslations();
  const { pending, go, router } = useAct();
  const [f, setF] = useState(initial);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [previewing, startPreview] = useTransition();
  const set =
    (k: keyof ProductFormValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });
  const num = (k: keyof ProductFormValue, lbl: string, step = "1") => (
    <F id={`p-${k}`} label={lbl}>
      <Input
        id={`p-${k}`}
        type="number"
        step={step}
        min="0"
        required
        value={f[k] as string}
        onChange={set(k)}
      />
    </F>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        go(
          () =>
            saveLoanProductAction(
              {
                ...f,
                description: f.description || null,
                dueMonthDay: f.dueMonthDay || null,
                minBand: f.minBand as "FAIR",
                allowedCategories: f.allowedCategories as "SEED"[],
                voucherValidDays: Number(f.voucherValidDays),
              },
              id,
            ),
          t("common.save"),
          () => router.push("/lender/products"),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <F id="p-name" label={t("lender.productName")}>
          <Input id="p-name" required value={f.name} onChange={set("name")} />
        </F>
        <Pick
          label={t("lender.minBand")}
          value={f.minBand}
          onChange={(v) => setF({ ...f, minBand: v })}
          options={["BUILDING", "FAIR", "GOOD", "STRONG"].map((b) => ({
            value: b,
            label: t(`band.${b}` as never),
          }))}
        />
        <F id="p-desc" label={t("lender.description")} className="sm:col-span-2">
          <Textarea id="p-desc" rows={2} value={f.description} onChange={set("description")} />
        </F>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {num("minAmountLe", t("lender.minAmount"))}
        {num("firstCycleMaxLe", t("lender.firstCycleMax"))}
        {num("maxAmountLe", t("lender.maxAmount"))}
        {num("flatFeePct", t("lender.fee"), "0.01")}
        {num("graduationPct", t("lender.graduation"))}
        {num("maxDebtToIncomePct", t("lender.dti"))}
        {num("maxRepaymentPctPerSale", t("lender.repayCap"))}
        {num("voucherValidDays", t("lender.voucherDays"))}
        <F id="p-due" label={t("lender.dueMonthDay")}>
          <Input
            id="p-due"
            placeholder="05-30"
            pattern="\d{2}-\d{2}"
            value={f.dueMonthDay}
            onChange={set("dueMonthDay")}
          />
        </F>
      </div>
      <Multi
        label={t("lender.categories")}
        options={["SEED", "FERTILISER", "AGROCHEM", "TOOLS"].map((c) => ({
          value: c,
          label: t(`inputCategory.${c}` as never),
        }))}
        value={f.allowedCategories}
        onChange={(v) => setF({ ...f, allowedCategories: v })}
      />
      <Multi
        label={t("lender.crops")}
        options={crops.map((c) => ({ value: c.id, label: c.name }))}
        value={f.cropIds}
        onChange={(v) => setF({ ...f, cropIds: v })}
      />
      <Multi
        label={t("lender.districts")}
        options={districts.map((c) => ({ value: c.id, label: c.name }))}
        value={f.districtIds}
        onChange={(v) => setF({ ...f, districtIds: v })}
      />
      {dealers.length ? (
        <Multi
          label={t("lender.dealers")}
          options={dealers.map((d) => ({ value: d.id, label: d.name }))}
          value={f.eligibleDealerIds}
          onChange={(v) => setF({ ...f, eligibleDealerIds: v })}
        />
      ) : null}
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={f.requiresGroupGuarantee}
            onCheckedChange={(c) => setF({ ...f, requiresGroupGuarantee: c === true })}
          />{" "}
          {t("lender.group")}
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={f.active}
            onCheckedChange={(c) => setF({ ...f, active: c === true })}
          />{" "}
          {t("lender.activeProduct")}
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} {t("common.save")}
        </Button>
        {id ? (
          <Button
            type="button"
            variant="outline"
            disabled={previewing}
            onClick={() =>
              startPreview(async () => {
                const r = await disclosureAction(id, f.firstCycleMaxLe);
                if (!r.ok) return void toast.error(r.error);
                setPreview(r.data.lines);
              })
            }
          >
            <FileTextIcon /> {t("lender.preview")}
          </Button>
        ) : null}
      </div>
      {preview ? <Terms lines={preview} /> : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Loan decisions
// ---------------------------------------------------------------------------

export function DecisionButtons({ loanId, canApprove }: { loanId: string; canApprove: boolean }) {
  const t = useTranslations("lender");
  const { pending, go } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="flex gap-2">
      {canApprove ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => go(() => approveLoanAction(loanId), t("approve"))}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {t("approve")}
        </Button>
      ) : null}
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <XIcon /> {t("decline")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("decline")}</DialogTitle>
          </DialogHeader>
          <F id="dreason" label={t("declineReason")}>
            <Textarea id="dreason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </F>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={pending || !reason}
              onClick={() =>
                go(
                  () => declineLoanAction(loanId, reason),
                  t("decline"),
                  () => setOpen(false),
                )
              }
            >
              {t("decline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ServicingForms({
  loanId,
  isAdmin,
  canDefault,
}: {
  loanId: string;
  isAdmin: boolean;
  canDefault: boolean;
}) {
  const t = useTranslations("lender");
  const { pending, go } = useAct();
  const [rep, setRep] = useState({ amountLe: "", reference: "" });
  const [rs, setRs] = useState({ dueDate: "", reason: "" });
  const [defReason, setDefReason] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("manualRepayment")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              go(
                () => manualRepaymentAction(loanId, rep.amountLe, rep.reference),
                t("manualRepayment"),
                () => setRep({ amountLe: "", reference: "" }),
              );
            }}
          >
            <F id="rp-amt" label="Le">
              <Input
                id="rp-amt"
                type="number"
                min="1"
                step="0.01"
                required
                className="w-28"
                value={rep.amountLe}
                onChange={(e) => setRep({ ...rep, amountLe: e.target.value })}
              />
            </F>
            <F id="rp-ref" label={t("reference")}>
              <Input
                id="rp-ref"
                required
                value={rep.reference}
                onChange={(e) => setRep({ ...rep, reference: e.target.value })}
              />
            </F>
            <Button type="submit" disabled={pending}>
              <HandCoinsIcon /> {t("manualRepayment")}
            </Button>
          </form>
        </CardContent>
      </Card>
      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("restructure")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                go(() => proposeRestructureAction(loanId, rs.dueDate, rs.reason), t("restructure"));
              }}
            >
              <F id="rs-date" label="Due">
                <Input
                  id="rs-date"
                  type="date"
                  required
                  value={rs.dueDate}
                  onChange={(e) => setRs({ ...rs, dueDate: e.target.value })}
                />
              </F>
              <F id="rs-reason" label={t("reason")}>
                <Input
                  id="rs-reason"
                  required
                  value={rs.reason}
                  onChange={(e) => setRs({ ...rs, reason: e.target.value })}
                />
              </F>
              <Button type="submit" variant="outline" disabled={pending}>
                <SendIcon /> {t("restructure")}
              </Button>
            </form>
            {canDefault ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  go(() => markDefaultAction(loanId, defReason), t("markDefault"));
                }}
              >
                <F id="df-reason" label={t("reason")}>
                  <Input
                    id="df-reason"
                    required
                    value={defReason}
                    onChange={(e) => setDefReason(e.target.value)}
                  />
                </F>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {t("markDefault")}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consent & offers
// ---------------------------------------------------------------------------

export function ConsentRequestForm() {
  const t = useTranslations();
  const { pending, go } = useAct();
  const [f, setF] = useState({
    farmer: "",
    scope: "PASSPORT_DETAILED",
    purpose: "",
    durationMonths: "12",
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1.4fr_1.6fr_5rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        go(
          () =>
            requestConsentAction({
              ...f,
              scope: f.scope as "PASSPORT_SUMMARY",
              durationMonths: Number(f.durationMonths),
            }),
          (d) => {
            const r = d as { ref: string; duplicate: boolean; agrilinkId: string };
            return r.duplicate
              ? t("lender.alreadyRequested", { ref: r.ref })
              : t("lender.requested", { ref: r.ref, id: r.agrilinkId });
          },
          () => setF({ ...f, farmer: "", purpose: "" }),
        );
      }}
    >
      <F id="cr-farmer" label={t("lender.farmerIdOrPhone")}>
        <Input
          id="cr-farmer"
          required
          placeholder="AP-BOM-000001"
          value={f.farmer}
          onChange={(e) => setF({ ...f, farmer: e.target.value })}
        />
      </F>
      <Pick
        label={t("lender.scope")}
        value={f.scope}
        onChange={(v) => setF({ ...f, scope: v })}
        options={["PASSPORT_SUMMARY", "PASSPORT_DETAILED", "RECORDS_FULL"].map((s) => ({
          value: s,
          label: t(`consentScope.${s}` as never),
        }))}
      />
      <F id="cr-purpose" label={t("lender.purpose2")}>
        <Input
          id="cr-purpose"
          required
          placeholder="assess a fertiliser loan"
          value={f.purpose}
          onChange={(e) => setF({ ...f, purpose: e.target.value })}
        />
      </F>
      <F id="cr-months" label={t("lender.months")}>
        <Input
          id="cr-months"
          type="number"
          min="1"
          max="24"
          value={f.durationMonths}
          onChange={(e) => setF({ ...f, durationMonths: e.target.value })}
        />
      </F>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}{" "}
        {t("lender.requestConsent")}
      </Button>
    </form>
  );
}

export function OfferForm({
  farmerId,
  products,
}: {
  farmerId: string;
  products: { id: string; name: string }[];
}) {
  const t = useTranslations("lender");
  const { pending, go } = useAct();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  if (!products.length) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go(
          () => makeOfferAction(farmerId, productId, amount),
          (d) => t("offerSent", { ref: (d as { ref: string }).ref }),
          () => setAmount(""),
        );
      }}
    >
      <Pick
        label={t("product")}
        value={productId}
        onChange={setProductId}
        options={products.map((p) => ({ value: p.id, label: p.name }))}
      />
      <F id={`of-${farmerId}`} label="Le">
        <Input
          id={`of-${farmerId}`}
          type="number"
          min="1"
          required
          className="w-28"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </F>
      <Button type="submit" size="sm" disabled={pending}>
        <HandCoinsIcon /> {t("makeOffer")}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Institution & savings custodian
// ---------------------------------------------------------------------------

export function InstitutionForm({
  initial,
}: {
  initial: {
    licenceNo: string;
    fundingProvider: string;
    fundingAccount: string;
    collectionAccount: string;
    savingsAccount: string;
    approvalThresholdLe: string;
  };
}) {
  const t = useTranslations();
  const { pending, go } = useAct();
  const [f, setF] = useState(initial);
  const txt = (k: keyof typeof f, label: string) => (
    <F id={`fi-${k}`} label={label}>
      <Input id={`fi-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </F>
  );
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        go(
          () =>
            updateInstitutionAction({
              ...f,
              fundingProvider: (f.fundingProvider || null) as "ORANGE_MONEY" | null,
              licenceNo: f.licenceNo || null,
              fundingAccount: f.fundingAccount || null,
              collectionAccount: f.collectionAccount || null,
              savingsAccount: f.savingsAccount || null,
            }),
          t("common.save"),
        );
      }}
    >
      {txt("licenceNo", t("lender.licence"))}
      <Pick
        label={t("lender.fundingProvider")}
        value={f.fundingProvider}
        onChange={(v) => setF({ ...f, fundingProvider: v })}
        options={["ORANGE_MONEY", "AFRIMONEY", "QMONEY"].map((p) => ({
          value: p,
          label: t(`providers.${p}` as never),
        }))}
      />
      {txt("fundingAccount", t("lender.fundingAccount"))}
      {txt("collectionAccount", t("lender.collectionAccount"))}
      {txt("savingsAccount", t("lender.savingsAccount"))}
      <F id="fi-thr" label={t("lender.threshold")}>
        <Input
          id="fi-thr"
          type="number"
          min="1"
          required
          value={f.approvalThresholdLe}
          onChange={(e) => setF({ ...f, approvalThresholdLe: e.target.value })}
        />
      </F>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          <SaveIcon /> {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

export function SavingsProductForm() {
  const t = useTranslations();
  const { pending, go } = useAct();
  const [f, setF] = useState({
    name: "Harvest Lock",
    type: "HARVEST_LOCK",
    defaultPct: "15",
    minPct: "5",
    maxPct: "40",
    releaseMonthDay: "04-01",
    earlyWithdrawalAllowed: true,
    earlyWithdrawalFeePct: "2",
    interestNote: "",
  });
  const txt = (k: keyof typeof f, label: string, type = "text") => (
    <F id={`sp-${k}`} label={label}>
      <Input
        id={`sp-${k}`}
        type={type}
        value={f[k] as string}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </F>
  );
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        go(
          () =>
            createSavingsProductAction({
              ...f,
              type: f.type as "HARVEST_LOCK",
              releaseRule:
                f.type === "GOAL" && !f.releaseMonthDay ? "GOAL_REACHED" : "SEASON_START",
              releaseMonthDay: f.releaseMonthDay || null,
              interestNote: f.interestNote || null,
            }),
          t("common.save"),
        );
      }}
    >
      {txt("name", t("lender.productName"))}
      <Pick
        label={t("groups.type")}
        value={f.type}
        onChange={(v) => setF({ ...f, type: v })}
        options={["HARVEST_LOCK", "GOAL"].map((v) => ({
          value: v,
          label: t(`savingsType.${v}` as never),
        }))}
      />
      {txt("releaseMonthDay", t("lender.releaseMonthDay"))}
      {txt("minPct", t("lender.minPct"), "number")}
      {txt("defaultPct", t("lender.defaultPct"), "number")}
      {txt("maxPct", t("lender.maxPct"), "number")}
      {txt("earlyWithdrawalFeePct", t("lender.earlyFee"), "number")}
      <div className="sm:col-span-2">{txt("interestNote", t("lender.interestNote"))}</div>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <Checkbox
          checked={f.earlyWithdrawalAllowed}
          onCheckedChange={(c) => setF({ ...f, earlyWithdrawalAllowed: c === true })}
        />{" "}
        {t("lender.earlyAllowed")}
      </label>
      <div>
        <Button type="submit" disabled={pending}>
          <SaveIcon /> {t("lender.newSavingsProduct")}
        </Button>
      </div>
    </form>
  );
}

export function ToggleSavingsProduct({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations("lender");
  const { pending, go } = useAct();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => go(() => toggleSavingsProductAction(id, !active), t("activeProduct"))}
    >
      {active ? "✓" : "—"} {t("activeProduct")}
    </Button>
  );
}

export function ReconcileSavingsForm() {
  const t = useTranslations("lender");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<{
    matched: string[];
    mismatched: { ref: string; ours: string; theirs: string }[];
    missing: string[];
    unknown: string[];
  } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Textarea
        rows={4}
        placeholder="SAV-000001, 1250.00"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        aria-label={t("reconcile")}
      />
      <p className="text-muted-foreground text-xs">{t("reconcileHint")}</p>
      <Button
        variant="outline"
        disabled={pending || !csv}
        onClick={() =>
          start(async () => {
            const r = await reconcileSavingsAction(csv);
            if (!r.ok) return void toast.error(r.error);
            setResult(r.data);
          })
        }
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {t("reconcile")}
      </Button>
      {result ? (
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <p>
            {t("matched")}: <b>{result.matched.length}</b>
          </p>
          <p>
            {t("mismatched")}: <b>{result.mismatched.length}</b>
          </p>
          <p>
            {t("missing")}: <b>{result.missing.length}</b>
          </p>
          <p>
            {t("unknown")}: <b>{result.unknown.length}</b>
          </p>
          {result.mismatched.map((m) => (
            <p key={m.ref} className="text-destructive sm:col-span-4">
              {m.ref}: AgriLink {m.ours} ≠ {m.theirs}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
