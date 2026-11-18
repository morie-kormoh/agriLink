"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BuildingIcon,
  ChevronRightIcon,
  HandCoinsIcon,
  Loader2Icon,
  ShieldIcon,
  SproutIcon,
  StoreIcon,
  TractorIcon,
  UserRoundIcon,
} from "lucide-react";
import { toast } from "@agripay/ui/components/sonner";
import { cn } from "@agripay/ui/lib/utils";
import { selectContextAction } from "@/app/actions/auth";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FARMER: SproutIcon,
  AGENT: TractorIcon,
  COOP_ADMIN: BuildingIcon,
  COOP_STAFF: BuildingIcon,
  BUYER_ADMIN: StoreIcon,
  BUYER_STAFF: StoreIcon,
  LENDER_ADMIN: HandCoinsIcon,
  LENDER_OFFICER: HandCoinsIcon,
  AGRO_DEALER: StoreIcon,
  PROGRAMME_OFFICER: UserRoundIcon,
  SUPER_ADMIN: ShieldIcon,
};

export function ContextPicker({
  contexts,
  next,
}: {
  contexts: {
    orgId: string | null;
    role: string;
    label: string;
    roleLabel: string;
    current: boolean;
  }[];
  next: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <ul className="space-y-2">
      {contexts.map((c) => {
        const Icon = ICONS[c.role] ?? UserRoundIcon;
        return (
          <li key={`${c.orgId}:${c.role}`}>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await selectContextAction({ orgId: c.orgId, role: c.role, next });
                  if (!res.ok) return void toast.error(res.error);
                  router.replace(res.data.redirectTo);
                  router.refresh();
                })
              }
              className={cn(
                "bg-card hover:border-primary hover:bg-secondary/50 flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-60",
                c.current && "border-primary",
              )}
            >
              <span className="bg-secondary text-primary rounded-md p-2">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.label}</span>
                <span className="text-muted-foreground block truncate text-sm">{c.roleLabel}</span>
              </span>
              {pending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ChevronRightIcon className="text-muted-foreground size-4" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
