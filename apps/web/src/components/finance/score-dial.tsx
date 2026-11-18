import { cn } from "@agripay/ui/lib/utils";

const BAND_COLOR: Record<string, string> = {
  BUILDING: "text-amber-500",
  FAIR: "text-sky-500",
  GOOD: "text-emerald-500",
  STRONG: "text-emerald-700",
};

/** Radial score (0–100) with the band label underneath. Pure SVG, works without JavaScript. */
export function ScoreDial({
  score,
  band,
  bandLabel,
  size = 168,
  caption,
}: {
  score: number;
  band: string;
  bandLabel: string;
  size?: number;
  caption?: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${score} / 100, ${bandLabel}`}
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="text-muted"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 50 50)"
          className={cn(BAND_COLOR[band] ?? "text-primary")}
        />
        <text
          x="50"
          y="52"
          textAnchor="middle"
          className="fill-foreground text-[26px] font-semibold tabular-nums"
          dominantBaseline="middle"
        >
          {score}
        </text>
        {caption ? (
          <text x="50" y="70" textAnchor="middle" className="fill-muted-foreground text-[7px]">
            {caption}
          </text>
        ) : null}
      </svg>
      <span className={cn("text-sm font-semibold", BAND_COLOR[band])}>{bandLabel}</span>
    </div>
  );
}

/** Tiny line chart of score history. */
export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const w = 160;
  const h = 40;
  const step = w / (points.length - 1);
  const d = points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / 100) * h).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("text-primary h-10 w-40", className)} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

const TONE: Record<string, "success" | "warning" | "destructive" | "info" | "muted" | "secondary"> =
  {
    APPLIED: "info",
    OFFERED: "info",
    ACCEPTED: "info",
    APPROVED: "info",
    DISBURSED: "secondary",
    REPAYING: "secondary",
    REPAID: "success",
    LATE: "warning",
    DEFAULTED: "destructive",
    RESTRUCTURED: "warning",
    WRITTEN_OFF: "destructive",
    CANCELLED: "muted",
    DECLINED: "muted",
    ISSUED: "info",
    PARTIALLY_REDEEMED: "secondary",
    REDEEMED: "success",
    EXPIRED: "muted",
    REQUESTED: "warning",
    GRANTED: "success",
    REVOKED: "muted",
    BUILDING: "warning",
    FAIR: "info",
    GOOD: "success",
    STRONG: "success",
  };
export const toneFor = (status: string) => TONE[status] ?? "muted";
