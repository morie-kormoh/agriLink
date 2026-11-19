import * as React from "react";
import { cn } from "../lib/utils";

/**
 * The money figure (docs/ui §4.2): the largest text on a farmer screen. "Le" is set smaller and raised;
 * incoming money is green with "+", outgoing is ink with "−" (red is only for errors and late amounts).
 */
export function MoneyFigure({
  amountLe,
  direction,
  size = "xl",
  caption,
  className,
}: {
  amountLe: string | number;
  direction?: "in" | "out";
  size?: "md" | "lg" | "xl";
  caption?: React.ReactNode;
  className?: string;
}) {
  const n = Number(amountLe);
  const frac = Math.round(Math.abs(n) * 100) % 100 !== 0;
  const text = Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: frac ? 2 : 0,
    maximumFractionDigits: frac ? 2 : 0,
  });
  const sz =
    size === "xl" ? "text-[2.5rem] leading-[2.75rem]" : size === "lg" ? "text-3xl" : "text-2xl";
  return (
    <div className={className}>
      <p
        className={cn(
          "font-display font-bold tabular-nums",
          sz,
          direction === "in" && "text-money-in",
        )}
        aria-label={`${direction === "out" ? "minus " : ""}Le ${text}`}
      >
        {direction === "in" ? "+" : direction === "out" ? "−" : ""}
        <span className="mr-1 align-[0.35em] text-[0.45em] font-semibold">Le</span>
        {text}
      </p>
      {caption ? <p className="text-muted-foreground mt-1 text-sm">{caption}</p> : null}
    </div>
  );
}

/** Card for money things (balance, voucher, receipt): 20px radius and the gara motif. */
export function MoneyCard({
  tone = "light",
  className,
  children,
}: {
  tone?: "light" | "indigo" | "gold";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-money)] border p-5",
        tone === "light" && "bg-card gara-light",
        tone === "indigo" && "bg-indigo gara border-indigo text-white",
        tone === "gold" && "bg-card gara-light border-gold border-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
