"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  title,
}: {
  personas: { key: string; name: string; description: string }[];
  /** "grid": one row of cards on wide screens (landing page). */
  layout?: "list" | "grid";
  title?: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("demo");
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {title !== null ? <p className="text-sm font-medium">{title ?? t("signInAs")}</p> : null}
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
                {i + 1}. {personaText(t, p, "name")}
              </span>
              <span className="text-muted-foreground block text-xs">
                {personaText(t, p, "description")}
              </span>
            </span>
          </button>
        ))}
      </div>
      <ResetDemoButton />
    </div>
  );
}

/** Translated persona name/description; organisation and farmer names stay as they are. */
function personaText(
  t: ReturnType<typeof useTranslations<"demo">>,
  p: { key: string; name: string; description: string },
  field: "name" | "description",
): string {
  const id = p.key.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
  const key = `personas.${id}.${field}` as Parameters<typeof t>[0];
  if (!t.has(key)) return p[field];
  const pin = /PIN (\d+)/.exec(p.description)?.[1] ?? "";
  return t(key, { pin });
}

export function ResetDemoButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const router = useRouter();
  const t = useTranslations();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t("demo.resetConfirm"))) return;
        start(async () => {
          const r = await resetDemoAction();
          if (!r.ok) return void toast.error(r.error);
          toast.success(
            t("demo.resetDone", {
              score: r.data.score,
              band: t(`band.${r.data.band}` as never).toLowerCase(),
            }),
          );
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} {t("demo.reset")}
    </Button>
  );
}
