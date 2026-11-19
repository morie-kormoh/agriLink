"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, MessageSquareTextIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrilink/ui/components/select";
import { toast } from "@agrilink/ui/components/sonner";
import { closeSeasonAction } from "@/app/actions/records";

export function SeasonPicker({ season, seasons }: { season: string; seasons: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select value={season} onValueChange={(v) => router.replace(`${pathname}?season=${v}`)}>
      <SelectTrigger className="w-36" aria-label="Season">
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
  );
}

export function CloseSeasonButton({ season, disabled }: { season: string; disabled?: boolean }) {
  const t = useTranslations("records");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={disabled || pending}
      onClick={() => {
        if (!confirm(`${t("closeSeason")} — ${season}?`)) return;
        start(async () => {
          const r = await closeSeasonAction(season);
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("closed", { farmers: r.data.farmers, sms: r.data.smsSent }));
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <MessageSquareTextIcon />}{" "}
      {t("closeSeason")}
    </Button>
  );
}
