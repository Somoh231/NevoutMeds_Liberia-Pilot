import { fmt, fmtK } from "@/platform/utils/format";

export function buildDashboardGreeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function formatDashboardDate(now = new Date()) {
  return now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
  const date = (opts.now ?? new Date()).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  return `*Nevoutmeds Daily Report — ${opts.pharmacy}*\n📅 ${date}\n\n💰 Sales today: ${opts.revenueToday}\n🧾 Transactions today: ${opts.salesCountToday}\n👥 Customers on file: ${opts.customersCount}\n⚠ Low stock: ${opts.lowStockCount} items\n💳 Credit outstanding: ${opts.creditOut}\n🔔 Reminders due: ${opts.dueRemindersCount} patients`;
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

