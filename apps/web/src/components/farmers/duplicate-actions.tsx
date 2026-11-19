"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckIcon, Loader2Icon, UserXIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { toast } from "@agrilink/ui/components/sonner";
import { resolveDuplicateAction } from "@/app/actions/farmers";

export function DuplicateActions({ farmerId }: { farmerId: string }) {
  const t = useTranslations("duplicates");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (outcome: "NOT_DUPLICATE" | "DEACTIVATE") =>
    startTransition(async () => {
      const res = await resolveDuplicateAction(farmerId, outcome);
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("resolved"));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run("NOT_DUPLICATE")}>
        {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {t("notDuplicate")}
      </Button>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => run("DEACTIVATE")}>
        <UserXIcon /> {t("markDuplicate")}
      </Button>
    </div>
  );
}
