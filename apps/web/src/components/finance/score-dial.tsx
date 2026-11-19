import { cn } from "@agrilink/ui/lib/utils";
import { PassportDial } from "@agrilink/ui/components/passport-dial";

/** Passport score dial: the 270° arc from docs/ui §4.5. Kept as a wrapper so existing pages need no change. */
export function ScoreDial({
  score,
  band,
  bandLabel,
  size = 180,
  caption,
}: {
  score: number;
  band: string;
  bandLabel: string;
  size?: number;
  caption?: string;
}) {
  return (
    <PassportDial score={score} band={band} bandLabel={bandLabel} size={size} caption={caption} />
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
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("text-indigo h-10 w-40 dark:text-white", className)}
      aria-hidden
    >
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
