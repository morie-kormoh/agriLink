import { ageInYears, formatLe, formatSlPhone, isYouth } from "@agrilink/validation";

export { formatLe, formatSlPhone, isYouth, ageInYears };

export function formatDate(
  d: Date | string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Freetown", ...opts }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined) {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function formatAcres(v: { toString(): string } | number | null | undefined) {
  if (v == null) return "—";
  const n = Number(v.toString());
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)} ac`;
}

export function percent(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
