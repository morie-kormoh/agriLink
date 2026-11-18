"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { Input } from "@agripay/ui/components/input";
import { toast } from "@agripay/ui/components/sonner";
import { resolveDisputeAction } from "@/app/actions/trade";

export function ResolveDispute({ purchaseId }: { purchaseId: string }) {
  const t = useTranslations("trade");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const run = (outcome: "UPHOLD" | "REJECT") =>
    start(async () => {
      const r = await resolveDisputeAction(purchaseId, outcome, note);
      if (!r.ok) return void toast.error(r.error);
      toast.success(t("resolved"));
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        className="sm:w-72"
        placeholder={t("resolutionNote")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={pending || note.trim().length < 3}
        onClick={() => run("UPHOLD")}
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <XIcon />} {t("uphold")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending || note.trim().length < 3}
        onClick={() => run("REJECT")}
      >
        <CheckIcon /> {t("reject")}
      </Button>
    </div>
  );
}
