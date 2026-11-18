"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { toast } from "@agripay/ui/components/sonner";
import { markInstructionFailedAction, retryInstructionAction } from "@/app/actions/payments";

export function InstructionActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations("payments");
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  return (
    <div className="flex justify-end gap-1">
      {status === "FAILED" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => retryInstructionAction(id))}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} {t("retry")}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const reason = prompt(t("markFailed"));
            if (reason) run(() => markInstructionFailedAction(id, reason));
          }}
        >
          <XIcon /> {t("markFailed")}
        </Button>
      )}
    </div>
  );
}
