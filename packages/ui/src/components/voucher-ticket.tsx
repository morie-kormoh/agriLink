import * as React from "react";
import { TicketIcon } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Input voucher as a ticket (docs/ui §4.3): gold edge, side notches, code in Atkinson Hyperlegible Mono
 * so a code read aloud matches what is printed.
 */
export function VoucherTicket({
  code,
  title,
  issuer,
  remaining,
  validUntil,
  note,
  children,
  className,
}: {
  code: string;
  title: React.ReactNode;
  issuer?: React.ReactNode;
  remaining: React.ReactNode;
  validUntil?: React.ReactNode;
  note?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div className="border-gold bg-card gara-light relative overflow-hidden rounded-[var(--radius-money)] border-2 px-6 py-5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <TicketIcon className="size-4 text-[#9a6a00]" aria-hidden /> {title}
          </span>
          {issuer ? <span className="text-muted-foreground truncate">{issuer}</span> : null}
        </div>
        <p
          className="text-ink my-3 font-mono text-[2rem] leading-none font-medium tracking-[0.12em] dark:text-white"
          aria-label={`Voucher code ${code.split("").join(" ")}`}
        >
          {code}
        </p>
        <p className="text-sm">{remaining}</p>
        {validUntil ? <p className="text-muted-foreground text-sm">{validUntil}</p> : null}
        {note ? <p className="text-muted-foreground mt-2 text-xs">{note}</p> : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
      {/* ticket notches */}
      <span
        aria-hidden
        className="bg-background border-gold absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full border-2 border-l-transparent"
      />
      <span
        aria-hidden
        className="bg-background border-gold absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full border-2 border-r-transparent"
      />
    </div>
  );
}
