"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, MoreHorizontalIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@agrilink/ui/components/dropdown-menu";
import { toast } from "@agrilink/ui/components/sonner";
import { setUserStatusAction, unlockPinAction } from "@/app/actions/admin";

export function UserActions({
  userId,
  status,
  pinLocked,
}: {
  userId: string;
  status: string;
  pinLocked: boolean;
}) {
  const t = useTranslations("admin");
  const tg = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={tg("common.actions")} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status === "SUSPENDED" ? (
          <DropdownMenuItem onSelect={() => run(() => setUserStatusAction(userId, "ACTIVE"))}>
            {t("activate")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => run(() => setUserStatusAction(userId, "SUSPENDED"))}
          >
            {t("suspend")}
          </DropdownMenuItem>
        )}
        {pinLocked ? (
          <DropdownMenuItem onSelect={() => run(() => unlockPinAction(userId))}>
            {t("unlockPin")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
