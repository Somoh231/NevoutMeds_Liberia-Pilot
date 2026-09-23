/** Days until an expiry date; a product with no recorded expiry never "expires" (Infinity). */
export const daysUntilExpiry = (d: string | null | undefined) =>
  d ? Math.ceil((new Date(d).getTime() - new Date().getTime()) / 86400000) : Infinity;

export const daysUntilStockout = (s: number, v: number) => (v <= 0 ? 999 : Math.floor(s / v));

/** "12 Mar 2027": unambiguous day-month-year with a four-digit year. */
export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** "Mar 2027" */
export const fmtMonthYear = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—";

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
