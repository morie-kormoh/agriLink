import { cn } from "@agrilink/ui/lib/utils";

/** AgriLink mark: a sprout over a split ribbon (gold saved, green to the farmer). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      <rect width="64" height="64" rx="16" fill="#1f2a6b" />
      <rect x="12" y="40" width="40" height="8" rx="4" fill="#2e9e5b" />
      <rect x="12" y="40" width="12" height="8" rx="4" fill="#f2b33d" />
      <path d="M32 36V18" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 26c-7 0-11-5-11-11 6 0 11 4 11 11Z" fill="#f2b33d" />
      <path d="M32 23c0-7 5-11 11-11 0 7-5 11-11 11Z" fill="#fff" />
    </svg>
  );
}
