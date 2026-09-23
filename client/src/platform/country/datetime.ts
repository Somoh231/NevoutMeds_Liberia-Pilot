/**
 * Business dates and localized date/number display.
 *
 * A pharmacy's "today" is its own timezone's calendar date, not the device's
 * and not UTC. Server reports resolve the timezone from the pharmacy row;
 * these helpers only mirror that for the UI (grouping, "today" filters).
 *
 * Two kinds of value:
 *   * date-only strings ("2027-03-12": expiry, business day, last visit) are
 *     calendar dates — formatted as-is, never shifted by any timezone;
 *   * timestamps (ISO with time) are instants — shown in the pharmacy's zone.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const dayKeyFormats = new Map<string, Intl.DateTimeFormat>();
function dayKeyFormat(timeZone: string): Intl.DateTimeFormat {
  let f = dayKeyFormats.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      f = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
    }
    dayKeyFormats.set(timeZone, f);
  }
  return f;
}

/** "YYYY-MM-DD" of an instant in a timezone. */
export function businessDayKey(instant: Date | string | number, timeZone: string): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return "";
  const parts = dayKeyFormat(timeZone).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The pharmacy's business date right now. */
export function businessToday(timeZone: string, now: Date = new Date()): string {
  return businessDayKey(now, timeZone);
}

/** Adds whole days to a "YYYY-MM-DD" key (calendar arithmetic, DST-safe). */
export function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Whole calendar days from `fromKey` to `toKey` (both "YYYY-MM-DD"). */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Minutes the zone is ahead of UTC at instant `t` (Africa/Nairobi → 180). */
function zoneOffsetMinutes(t: number, timeZone: string): number {
  const parts = wallClockFormat(timeZone).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((wall - Math.floor(t / 1000) * 1000) / 60000);
}

const wallClockFormats = new Map<string, Intl.DateTimeFormat>();
function wallClockFormat(timeZone: string): Intl.DateTimeFormat {
  let f = wallClockFormats.get(timeZone);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    };
    try {
      f = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone });
    } catch {
      f = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" });
    }
    wallClockFormats.set(timeZone, f);
  }
  return f;
}

/**
 * The instant a business day starts in a timezone (the lower bound for
 * "today's sales"). Needs no timezone library: the zone's offset is read
 * from Intl, twice so a DST change on that day is handled.
 */
export function startOfBusinessDay(dayKey: string, timeZone: string): Date {
  const utcMidnight = Date.parse(`${dayKey}T00:00:00Z`);
  let t = utcMidnight - zoneOffsetMinutes(utcMidnight, timeZone) * 60000;
  t = utcMidnight - zoneOffsetMinutes(t, timeZone) * 60000;
  return new Date(t);
}

export type DateStyle = "medium" | "monthYear" | "dayMonth" | "weekdayDay";

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  medium: { day: "numeric", month: "short", year: "numeric" },   // 12 Mar 2027
  monthYear: { month: "short", year: "numeric" },                 // Mar 2027
  dayMonth: { day: "numeric", month: "short" },                   // 12 Mar
  weekdayDay: { weekday: "short", day: "numeric", month: "short" } // Fri 12 Mar
};

const displayFormats = new Map<string, Intl.DateTimeFormat>();
function displayFormat(locale: string, timeZone: string, opts: Intl.DateTimeFormatOptions, key: string) {
  const k = `${locale}|${timeZone}|${key}`;
  let f = displayFormats.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...opts, timeZone });
    } catch {
      f = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" });
    }
    displayFormats.set(k, f);
  }
  return f;
}

/**
 * "12 Mar 2027". A date-only value is shown as that calendar date (formatted
 * in UTC so no zone can shift it); a timestamp is shown in `timeZone`.
 */
export function formatDate(value: string | Date | null | undefined, opts: { locale?: string; timeZone?: string; style?: DateStyle } = {}): string {
  if (!value) return "—";
  const dateOnly = typeof value === "string" && DATE_ONLY.test(value);
  const d = dateOnly ? new Date(`${value}T00:00:00Z`) : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const style = opts.style ?? "medium";
  const zone = dateOnly ? "UTC" : opts.timeZone ?? "UTC";
  return displayFormat(opts.locale ?? "en-GB", zone, OPTIONS[style], style).format(d);
}

/** "12 Mar 2027, 14:05" in the pharmacy's timezone (24-hour clock). */
export function formatDateTime(value: string | Date | null | undefined, opts: { locale?: string; timeZone?: string } = {}): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return displayFormat(opts.locale ?? "en-GB", opts.timeZone ?? "UTC",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, "datetime").format(d);
}

const plainNumbers = new Map<string, Intl.NumberFormat>();
/** Grouped integer/decimal per locale ("1,250" in en-*, "1 250" in fr-RW). */
export function formatNumber(n: number, opts: { locale?: string; digits?: number } = {}): string {
  const k = `${opts.locale ?? "en"}|${opts.digits ?? 0}`;
  let f = plainNumbers.get(k);
  if (!f) {
    try {
      f = new Intl.NumberFormat(opts.locale ?? "en", { maximumFractionDigits: opts.digits ?? 0 });
    } catch {
      f = new Intl.NumberFormat("en", { maximumFractionDigits: opts.digits ?? 0 });
    }
    plainNumbers.set(k, f);
  }
  return f.format(Number.isFinite(n) ? n : 0);
}
