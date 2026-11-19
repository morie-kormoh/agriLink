"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BanknoteIcon,
  Loader2Icon,
  RotateCcwIcon,
  ScaleIcon,
  SproutIcon,
  StoreIcon,
  UserCheckIcon,
} from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { toast } from "@agrilink/ui/components/sonner";
import { demoSignInAction, resetDemoAction } from "@/app/actions/demo";

const ICONS: Record<string, React.ReactNode> = {
  "coop-staff": <ScaleIcon className="size-5" />,
  "coop-manager": <UserCheckIcon className="size-5" />,
  farmer: <SproutIcon className="size-5" />,
  lender: <BanknoteIcon className="size-5" />,
  dealer: <StoreIcon className="size-5" />,
};

/** Demo only: sign in as one of the story's five people with one click. */
export function PersonaSwitcher({
  personas,
  layout = "list",
  title = "Demo — sign in as",
}: {
  personas: { key: string; name: string; description: string }[];
  /** "grid": one row of cards on wide screens (landing page). */
  layout?: "list" | "grid";
  title?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      <div
        className={layout === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5" : "grid gap-2"}
      >
        {personas.map((p, i) => (
          <button
            key={p.key}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setActive(p.key);
                const r = await demoSignInAction(p.key);
                if (!r.ok) {
                  setActive(null);
                  return void toast.error(r.error);
                }
                router.push(r.data.redirectTo);
                router.refresh();
              })
            }
            className={
              layout === "grid"
                ? "bg-card hover:border-indigo/50 flex items-center gap-3 rounded-xl border p-4 text-left transition-colors disabled:opacity-60 lg:flex-col lg:items-start"
                : "bg-card hover:bg-secondary flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60"
            }
          >
            <span className="bg-secondary text-indigo flex size-9 shrink-0 items-center justify-center rounded-full dark:text-white">
              {active === p.key ? <Loader2Icon className="size-5 animate-spin" /> : ICONS[p.key]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {i + 1}. {p.name}
              </span>
              <span className="text-muted-foreground block text-xs">{p.description}</span>
            </span>
          </button>
        ))}
      </div>
      <ResetDemoButton />
    </div>
  );
}

export function ResetDemoButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            "Reset the demo to the start of the story? Aminata's loans, vouchers and extra sales are removed.",
          )
        )
          return;
        start(async () => {
          const r = await resetDemoAction();
          if (!r.ok) return void toast.error(r.error);
          toast.success(
            `Demo reset — Aminata's score ${r.data.score} (${r.data.band.toLowerCase()})`,
          );
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Reset demo
    </Button>
  );
}
