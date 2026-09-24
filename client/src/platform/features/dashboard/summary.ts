import { fmt, fmtK } from "@/platform/utils/format";
import { getActiveTenantConfig } from "@/platform/country/tenant";

/** A long date in the pharmacy's own timezone and locale (not the device's). */
function tenantLongDate(now: Date, weekday: "long" | "short") {
  const { locale, timezone } = getActiveTenantConfig();
  const opts: Intl.DateTimeFormatOptions = { weekday, day: "numeric", month: "long", year: "numeric", timeZone: timezone };
  try {
    return now.toLocaleDateString(locale, opts);
  } catch {
    return now.toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  }
}

/** Greets by the pharmacy's local time of day. */
export function buildDashboardGreeting(now = new Date()) {
  const { timezone } = getActiveTenantConfig();
  let hour = now.getUTCHours();
  try {
    hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(now));
  } catch {
    // Unknown zone: UTC is the safest neutral answer.
  }
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function formatDashboardDate(now = new Date()) {
  return tenantLongDate(now, "long");
}

// Every figure is passed in from real data; nothing here is invented.
export function buildDailyWhatsappSummary(opts: {
  pharmacy: string;
  lowStockCount: number;
  creditOut: string;
  dueRemindersCount: number;
  revenueToday: string;
  salesCountToday: number;
  customersCount: number;
  now?: Date;
}) {
  const date = tenantLongDate(opts.now ?? new Date(), "short");
  // Plain, professional text: it is forwarded to owners and partners as-is.
  return `*Daily Report — ${opts.pharmacy}*\n${date}\n\nSales today: ${opts.revenueToday} (${opts.salesCountToday} sale${opts.salesCountToday === 1 ? "" : "s"})\nCredit outstanding: ${opts.creditOut}\nLow or out of stock: ${opts.lowStockCount} product${opts.lowStockCount === 1 ? "" : "s"}\nRefills due: ${opts.dueRemindersCount}\nCustomers on file: ${opts.customersCount}\n\n_Sent from NevOut Meds_`;
}

export function buildDashboardKpis(args: {
  userRole: string;
  alertsCount: number;
  criticalAlertsCount: number;
  dueRemindersCount: number;
  creditOutAmount: number;
  customersWithCreditCount: number;
  revenueMtd: number;
  revenueToday: number;
  salesCountToday: number;
}) {
  const base = [
    { label: "Today's Revenue", value: fmt(args.revenueToday), sub: `${args.salesCountToday} sale${args.salesCountToday === 1 ? "" : "s"} recorded`, color: "#0b6b50", icon: "💰", screen: "financials" },
    {
      label: "Stock Alerts",
      value: args.alertsCount,
      sub: `${args.criticalAlertsCount} critical`,
      color: args.alertsCount > 0 ? "#ef4444" : "#0b6b50",
      icon: "📦",
      screen: "inventory"
    },
    {
      label: "Reminders Due",
      value: args.dueRemindersCount,
      sub: "patients need refills",
      color: args.dueRemindersCount > 0 ? "#f59e0b" : "#0b6b50",
      icon: "🔔",
      screen: "reminders"
    },
    {
      label: "Credit Out",
      value: fmt(args.creditOutAmount),
      sub: `${args.customersWithCreditCount} customers`,
      color: args.creditOutAmount > 50 ? "#f97316" : "#0b6b50",
      icon: "💳",
      screen: "customers"
    }
  ];

  if (args.userRole !== "owner") return base;

  // Supplier debt is not tracked anywhere yet, so no "Debt Warning" tile is
  // shown rather than an invented one (Phase 3).
  return [
    ...base,
    { label: "Revenue (30 days)", value: fmtK(args.revenueMtd), sub: "from recorded sales", color: "#0b6b50", icon: "📈", screen: "financials" }
  ];
}

