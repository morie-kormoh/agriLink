import * as React from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  ClockIcon,
  InfoIcon,
  MinusCircleIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./badge";

/** Page title row with optional description and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="font-display text-ink text-[1.75rem] leading-tight font-bold tracking-tight md:text-3xl dark:text-white">
          {title}
        </h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** KPI tile. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl border p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">{label}</p>
        {Icon ? (
          <span className="bg-secondary text-indigo rounded-lg p-1.5 dark:text-white">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

/** Friendly empty state for lists. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="bg-secondary text-primary rounded-full p-3">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "success" | "warning" | "destructive" | "info" | "muted" | "secondary";

const TONE_ICON: Record<Tone, LucideIcon> = {
  success: CheckCircle2Icon,
  warning: ClockIcon,
  destructive: AlertTriangleIcon,
  info: CircleDotIcon,
  muted: MinusCircleIcon,
  secondary: InfoIcon,
};

/** Status pill: icon + word, never colour alone (docs/ui §4.6). */
export function StatusBadge({
  tone = "muted",
  children,
  icon = true,
}: {
  tone?: Tone;
  children: React.ReactNode;
  icon?: boolean;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <Badge variant={tone}>
      {icon ? <Icon aria-hidden /> : null}
      {children}
    </Badge>
  );
}

/**
 * One row of key numbers separated by thin rules (docs/ui §4.8), used at the top of dashboards
 * instead of a grid of identical cards.
 */
export function StatStrip({
  items,
  className,
}: {
  items: {
    label: React.ReactNode;
    value: React.ReactNode;
    hint?: React.ReactNode;
    tone?: "danger" | "good";
  }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "bg-card grid grid-cols-2 overflow-hidden rounded-xl border sm:flex sm:divide-x",
        className,
      )}
    >
      {items.map((it, i) => (
        <div key={i} className="min-w-0 flex-1 border-b p-4 sm:border-b-0 sm:px-5">
          <dt className="text-muted-foreground truncate text-sm">{it.label}</dt>
          <dd
            className={cn(
              "font-display mt-1 text-2xl font-bold tabular-nums",
              it.tone === "danger" && "text-kola",
              it.tone === "good" && "text-primary",
            )}
          >
            {it.value}
          </dd>
          {it.hint ? <p className="text-muted-foreground mt-0.5 text-xs">{it.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/** Labelled read-only value, used on profile pages. */
export function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{children ?? "—"}</dd>
    </div>
  );
}
