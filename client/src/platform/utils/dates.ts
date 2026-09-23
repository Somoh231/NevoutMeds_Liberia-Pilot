import { daysBetween } from "@/platform/country/datetime";
import { tenantDate, tenantToday } from "@/platform/country/tenant";

/**
 * Whole days from the pharmacy's business date to an expiry date (0 = expires
 * today). A product with no recorded expiry never "expires" (Infinity).
 */
export const daysUntilExpiry = (d: string | null | undefined) =>
  d ? daysBetween(tenantToday(), String(d).slice(0, 10)) : Infinity;

export const daysUntilStockout = (s: number, v: number) => (v <= 0 ? 999 : Math.floor(s / v));

/**
 * "12 Mar 2027": unambiguous day-month-year with a four-digit year, in the
 * pharmacy's locale. Date-only values (expiry) are never shifted by a
 * timezone; timestamps are shown in the pharmacy's timezone.
 */
export const fmtDate = (d: string | null | undefined) => (d ? tenantDate(d, "medium") : "—");

/** "Mar 2027" */
export const fmtMonthYear = (d: string | null | undefined) => (d ? tenantDate(d, "monthYear") : "—");

/** "2 h ago", "3 d ago" — for activity feeds. */
export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(iso);
}
