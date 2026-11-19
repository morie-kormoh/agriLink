"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileTextIcon, Loader2Icon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import { toast } from "@agrilink/ui/components/sonner";

import { applyLoanAction, disclosureAction } from "@/app/actions/finance";
import { PinConfirm } from "./pin-confirm";

/** Amount → read the plain-language terms → confirm with PIN. */
export function ApplyForm({
  productId,
  limitLe,
  minLe,
  lender,
}: {
  productId: string;
  limitLe: string;
  minLe: string;
  lender: string;
}) {
  const t = useTranslations("credit");
  const [amount, setAmount] = useState(limitLe);
  const [terms, setTerms] = useState<{ lines: string[]; totalLe: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={`amt-${productId}`}>{t("amount")}</Label>
        <Input
          id={`amt-${productId}`}
          type="number"
          inputMode="decimal"
          min={minLe}
          max={limitLe}
          step="1"
          className="w-36"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <Button
        disabled={
          loading || !amount || Number(amount) < Number(minLe) || Number(amount) > Number(limitLe)
        }
        onClick={() =>
          start(async () => {
            const r = await disclosureAction(productId, amount);
            if (!r.ok) return void toast.error(r.error);
            setTerms({ lines: r.data.lines, totalLe: r.data.totalLe });
            setOpen(true);
          })
        }
      >
        {loading ? <Loader2Icon className="animate-spin" /> : <FileTextIcon />} {t("readTerms")}
      </Button>
      <PinConfirm
        hideTrigger
        open={open}
        onOpenChange={setOpen}
        label={t("apply")}
        title={t("terms")}
        action={applyLoanAction.bind(null, productId, amount)}
        successMessage={t("applied")}
      >
        {terms ? <Terms lines={terms.lines} note={t("applySharing", { lender })} /> : null}
      </PinConfirm>
    </div>
  );
}

export function Terms({ lines, note }: { lines: string[]; note?: string }) {
  return (
    <div className="bg-muted space-y-2 rounded-lg p-3 text-sm">
      <p className="font-semibold">{lines[0]}</p>
      <ul className="list-disc space-y-1 pl-5">
        {lines.slice(1).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}
