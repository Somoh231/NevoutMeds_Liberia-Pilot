import { daysBetween } from "@/platform/country/datetime";
import { tenantDate, tenantToday } from "@/platform/country/tenant";

export function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "12 Mar 2027" in the pharmacy's locale (day-month order, never US month-first). */
export function fmtDate(d: string | null | undefined) {
  return d ? tenantDate(d, "medium") : "—";
}

/** Whole days from the pharmacy's business date to a (document expiry) date. */
export function daysUntil(d: string | null | undefined) {
  if (!d) return null;
  return daysBetween(tenantToday(), String(d).slice(0, 10));
}

