"use client";

import * as React from "react";
import {
  HandCoinsIcon,
  PiggyBankIcon,
  ShieldIcon,
  StoreIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils";

/**
 * The Split Ribbon (docs/ui/AgriLink_UI_UX_Design.md §2 and §4.1): one horizontal bar that shows how a
 * payment splits — loan, savings, co-op dues, then the farmer's share last. With `animate`, it plays the
 * "split moment" once: segments fill left to right while the amounts count up (600 ms). Reduced motion
 * shows it fully drawn.
 */
export type SplitKind =
  | "LOAN_REPAYMENT"
  | "SAVINGS"
  | "COOP_DUES"
  | "INSURANCE_PREMIUM"
  | "FARMER_WALLET"
  | "DEALER_SETTLEMENT";

export interface RibbonSplit {
  type: SplitKind | string;
  amountLe: string | number;
}

const ORDER: Record<string, number> = {
  LOAN_REPAYMENT: 1,
  SAVINGS: 2,
  COOP_DUES: 3,
  INSURANCE_PREMIUM: 4,
  DEALER_SETTLEMENT: 5,
  FARMER_WALLET: 9,
};
const FILL: Record<string, string> = {
  LOAN_REPAYMENT: "bg-split-loan",
  SAVINGS: "bg-split-savings",
  COOP_DUES: "bg-split-dues",
  INSURANCE_PREMIUM: "bg-split-insurance",
  FARMER_WALLET: "bg-split-farmer",
  DEALER_SETTLEMENT: "bg-split-dealer",
};
const DOT: Record<string, string> = {
  LOAN_REPAYMENT: "text-split-loan dark:text-indigo-300",
  SAVINGS: "text-[#9a6a00] dark:text-split-savings",
  COOP_DUES: "text-split-dues dark:text-sky-300",
  INSURANCE_PREMIUM: "text-split-insurance",
  FARMER_WALLET: "text-primary",
  DEALER_SETTLEMENT: "text-split-dealer",
};
const ICON: Record<string, LucideIcon> = {
  LOAN_REPAYMENT: HandCoinsIcon,
  SAVINGS: PiggyBankIcon,
  COOP_DUES: UsersIcon,
  INSURANCE_PREMIUM: ShieldIcon,
  FARMER_WALLET: WalletIcon,
  DEALER_SETTLEMENT: StoreIcon,
};
const DEFAULT_LABELS: Record<string, string> = {
  LOAN_REPAYMENT: "Loan",
  SAVINGS: "Saved",
  COOP_DUES: "Dues",
  INSURANCE_PREMIUM: "Insurance",
  FARMER_WALLET: "Farmer",
  DEALER_SETTLEMENT: "Dealer",
};

export function formatLeShort(v: number) {
  const frac = Math.round(v * 100) % 100 !== 0;
  return `Le ${v.toLocaleString("en-GB", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: frac ? 2 : 0 })}`;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** 0 → 1 over `ms` after `start`, eased; 1 immediately when not animating. */
function useProgress(active: boolean, ms: number) {
  const [p, setP] = React.useState(active ? 0 : 1);
  React.useEffect(() => {
    if (!active) {
      setP(1);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const x = Math.min(1, (t - t0) / ms);
      setP(1 - Math.pow(1 - x, 3));
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, ms]);
  return p;
}

export function SplitRibbon({
  splits,
  grossLe,
  size = "md",
  animate = false,
  labels,
  farmerLabel = "You",
  showLegend = true,
  floorApplied = false,
  floorNote = "We kept at least 30% for you.",
  className,
}: {
  splits: RibbonSplit[];
  grossLe?: string | number;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  labels?: Partial<Record<string, string>>;
  /** Shown for the farmer's share: "You" on farmer screens, the farmer's name elsewhere. */
  farmerLabel?: string;
  showLegend?: boolean;
  floorApplied?: boolean;
  floorNote?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const p = useProgress(animate && !reduced, 600);
  const rows = [...splits]
    .map((s) => ({ type: s.type, amount: Number(s.amountLe) }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => (ORDER[a.type] ?? 8) - (ORDER[b.type] ?? 8));
  const total = grossLe != null ? Number(grossLe) : rows.reduce((t, r) => t + r.amount, 0);
  // Any share under 4% is drawn at 4% so it stays visible; the legend shows the real amount.
  const widths = rows.map((r) => Math.max(total ? (r.amount / total) * 100 : 0, 4));
  const scale = 100 / (widths.reduce((a, b) => a + b, 0) || 1);
  const label = (t: string) =>
    t === "FARMER_WALLET" ? farmerLabel : (labels?.[t] ?? DEFAULT_LABELS[t] ?? t);
  const h = size === "sm" ? "h-2.5" : size === "lg" ? "h-6" : "h-4";
  const spoken = `Payment of ${formatLeShort(total)}: ${rows.map((r) => `${label(r.type)} ${formatLeShort(r.amount)}`).join(", ")}`;

  // Segments fill one after another: segment i draws during its slice of the 600 ms.
  let cursor = 0;
  return (
    <div className={cn("space-y-2", className)}>
      <div
        role="img"
        aria-label={spoken}
        className={cn("bg-muted flex w-full gap-0.5 overflow-hidden rounded-full", h)}
      >
        {rows.map((r, i) => {
          const w = widths[i]! * scale;
          const from = cursor / 100;
          cursor += w;
          const local = Math.max(0, Math.min(1, (p - from) / (w / 100 || 1)));
          return (
            <span key={`${r.type}-${i}`} className="relative h-full" style={{ width: `${w}%` }}>
              <span
                className={cn("absolute inset-y-0 left-0 rounded-full", FILL[r.type] ?? "bg-slate")}
                style={{ width: `${local * 100}%` }}
              />
            </span>
          );
        })}
      </div>
      {showLegend ? (
        <ul className={cn("flex flex-wrap gap-x-4 gap-y-1", size === "sm" ? "text-xs" : "text-sm")}>
          {rows.map((r, i) => {
            const Icon = ICON[r.type] ?? WalletIcon;
            const farmer = r.type === "FARMER_WALLET";
            return (
              <li
                key={`${r.type}-l-${i}`}
                className={cn("flex items-center gap-1.5", farmer && "font-semibold")}
              >
                <Icon className={cn("size-3.5", DOT[r.type])} aria-hidden />
                <span className="text-muted-foreground">{label(r.type)}</span>
                <span className="tabular-nums">
                  {formatLeShort(Math.round(r.amount * p * 100) / 100)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {floorApplied ? (
        <p className="bg-gold/20 text-ink rounded-lg px-2.5 py-1 text-xs dark:text-white">
          {floorNote}
        </p>
      ) : null}
    </div>
  );
}
