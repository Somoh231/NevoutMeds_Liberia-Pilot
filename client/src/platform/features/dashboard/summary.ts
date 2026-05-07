import { fmt, fmtK } from "@/platform/utils/format";

export function buildDashboardGreeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function buildDailyWhatsappSummary(opts: {
  pharmacy: string;
  lowStockCount: number;
  creditOut: string;
  dueRemindersCount: number;
}) {
  // NOTE: Intentionally preserves the existing hard-coded date/content for the pilot demo UI.
  return `*Nevoutmeds Daily Report — ${opts.pharmacy}*\n📅 Wed 22 April 2026\n\n💰 Sales today: $240\n📦 Items dispensed: 47\n👥 Customers: 31 (4 new)\n⚠ Low stock: ${opts.lowStockCount} items\n💳 Credit outstanding: ${opts.creditOut}\n🔔 Reminders due: ${opts.dueRemindersCount} patients\n\n_Reply REPORT for full details_`;
}

export function buildDashboardKpis(args: {
  userRole: string;
  alertsCount: number;
  criticalAlertsCount: number;
  dueRemindersCount: number;
  creditOutAmount: number;
  customersWithCreditCount: number;
  revenueMtd: number;
  overdueDebtCount: number;
  overdueDebtTotal: number;
}) {
  const base = [
    { label: "Today's Revenue", value: "$240", sub: "↑ 12% vs yesterday", color: "#10b981", icon: "💰", screen: null },
    {
      label: "Stock Alerts",
      value: args.alertsCount,
      sub: `${args.criticalAlertsCount} critical`,
      color: args.alertsCount > 0 ? "#ef4444" : "#10b981",
      icon: "📦",
      screen: "inventory"
    },
    {
      label: "Reminders Due",
      value: args.dueRemindersCount,
      sub: "patients need refills",
      color: args.dueRemindersCount > 0 ? "#f59e0b" : "#10b981",
      icon: "🔔",
      screen: "reminders"
    },
    {
      label: "Credit Out",
      value: fmt(args.creditOutAmount),
      sub: `${args.customersWithCreditCount} customers`,
      color: args.creditOutAmount > 50 ? "#f97316" : "#10b981",
      icon: "💳",
      screen: "customers"
    }
  ];

  if (args.userRole !== "owner") return base;

  return [
    ...base,
    { label: "Monthly Revenue", value: fmtK(args.revenueMtd), sub: "↑ 22% vs last year", color: "#10b981", icon: "📈", screen: "financials" },
    {
      label: "Debt Warning",
      value: args.overdueDebtCount > 0 ? "OVERDUE" : "On Track",
      sub: args.overdueDebtCount > 0 ? `${fmt(args.overdueDebtTotal)} overdue` : "All payments current",
      color: args.overdueDebtCount > 0 ? "#ef4444" : "#10b981",
      icon: "🏦",
      screen: "financials"
    }
  ];
}

