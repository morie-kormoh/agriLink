import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "../lib/utils";

/** Horizontal progress indicator for multi-step forms (compact on phones). */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <nav aria-label="Progress" className={cn("w-full", className)}>
      <p className="text-muted-foreground mb-2 text-sm sm:hidden">
        {current + 1} / {steps.length} ·{" "}
        <span className="text-foreground font-medium">{steps[current]}</span>
      </p>
      <ol className="flex items-center gap-1 sm:gap-2">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={label}
              className="flex flex-1 items-center gap-2"
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden truncate text-xs sm:inline",
                  active ? "font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {i < steps.length - 1 ? (
                <span className={cn("bg-border h-px flex-1", done && "bg-primary")} aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
