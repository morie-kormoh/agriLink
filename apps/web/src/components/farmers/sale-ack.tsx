"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckIcon, FlagIcon, Loader2Icon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Input } from "@agrilink/ui/components/input";
import { toast } from "@agrilink/ui/components/sonner";
import { acknowledgePurchaseAction } from "@/app/actions/trade";

export function SaleAck({ purchaseRef }: { purchaseRef: string }) {
  const t = useTranslations("sales");
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const send = (reply: "1" | "2") =>
    start(async () => {
      const r = await acknowledgePurchaseAction(
        purchaseRef,
        reply,
        reply === "2" ? reason : undefined,
      );
      if (!r.ok) return void toast.error(r.error);
      toast.success(reply === "1" ? t("confirmed") : t("reported"));
      router.refresh();
    });
  if (reporting) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder={t("reportReason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <Button
          variant="destructive"
          size="sm"
          disabled={pending || reason.trim().length < 3}
          onClick={() => send("2")}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <FlagIcon />} {t("report")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => send("1")}>
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {t("confirm")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setReporting(true)}>
        <FlagIcon /> {t("report")}
      </Button>
    </div>
  );
}
