import * as React from "react";
import { cn } from "../lib/utils";

/**
 * Passport dial (docs/ui §4.5): a 270° arc in the band's colour with the score in the middle.
 * Building = gold, Fair = teal, Good = paddy, Strong = indigo.
 */
export const BAND_STROKE: Record<string, string> = {
  BUILDING: "var(--gold)",
  FAIR: "var(--teal)",
  GOOD: "var(--paddy)",
  STRONG: "var(--indigo)",
};
export const BAND_TEXT: Record<string, string> = {
  BUILDING: "text-[#9a6a00] dark:text-gold",
  FAIR: "text-teal dark:text-sky-300",
  GOOD: "text-primary",
  STRONG: "text-indigo dark:text-indigo-200",
};

export function PassportDial({
  score,
  band,
  bandLabel,
  caption,
  size = 200,
  className,
}: {
  score: number;
  band: string;
  bandLabel: string;
  caption?: string;
  size?: number;
  className?: string;
}) {
  const r = 40;
  const arc = 2 * Math.PI * r * 0.75; // 270°
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg
        width={size}
        height={size * 0.86}
        viewBox="0 0 100 86"
        role="img"
        aria-label={`${score} out of 100, ${bandLabel}`}
      >
        <g transform="rotate(135 50 50)">
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${arc} 999`}
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={BAND_STROKE[band] ?? "var(--primary)"}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${arc * pct} 999`}
          />
        </g>
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground font-display text-[26px] font-bold"
        >
          {score}
        </text>
        {caption ? (
          <text x="50" y="66" textAnchor="middle" className="fill-muted-foreground text-[7px]">
            {caption}
          </text>
        ) : null}
      </svg>
      <span className={cn("font-display -mt-2 text-lg font-bold", BAND_TEXT[band])}>
        {bandLabel}
      </span>
    </div>
  );
}
