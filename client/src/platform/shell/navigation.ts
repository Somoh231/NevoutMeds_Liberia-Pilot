import type { LucideIcon } from "@/platform/ui/icons";
import { can, type Capability } from "@/platform/auth/capabilities";
import { BellRing, CalendarClock, ShieldCheck, ChartLine, FileBarChart, FolderOpen, LayoutDashboard, Package, Settings, ShoppingCart, Sparkles, Truck, Upload, UserCog, Users, Wallet } from "@/platform/ui/icons";

/**
 * Information architecture (see docs/ux/UX_DECISIONS.md).
 *
 * Grouped by the job a pharmacist is doing, not by data table:
 *  - Operations: the counter, all day, every role.
 *  - Procurement: buying — supplier prices, orders.
 *  - Insights: money and trends.
 *  - Management: people, records, data.
 * Each destination names the capability it needs (auth/capabilities.ts); a
 * person only sees what their role grants (not greyed out: absent), so staff
 * navigation is five calm items. The server enforces the same capabilities.
 * The platform admin console is not part of a pharmacy's navigation; it lives
 * in the account menu, visibly separate.
 */
export type ScreenId =
  | "dashboard"
  | "sales"
  | "inventory"
  | "customers"
  | "reminders"
  | "expiry"
  | "suppliers"
  | "financials"
  | "analytics"
  | "reports"
  | "staff"
  | "documents"
  | "settings"
  | "security";

export type NavItem = {
  id: ScreenId | "import";
  label: string;
  icon: LucideIcon;
  /** Route-based destinations leave the workspace screen switcher. */
  href?: string;
  description?: string;
  /** Needed to see and open this destination. Absent = every signed-in member. */
  capability?: Capability;
};

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "operations",
    label: "Operations",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "What needs attention today" },
      { id: "sales", label: "Sales", icon: ShoppingCart, description: "Record a sale at the counter" },
      { id: "inventory", label: "Inventory", icon: Package, description: "Stock levels, expiry, adjustments" },
      { id: "expiry", label: "Expiry", icon: CalendarClock, description: "What expires soon and what to do" },
      { id: "customers", label: "Customers", icon: Users, description: "Patients, sales and credit" },
      { id: "reminders", label: "Reminders", icon: BellRing, description: "Refills due" }
    ]
  },
  {
    id: "procurement",
    label: "Procurement",
    items: [{ id: "suppliers", label: "Suppliers", icon: Truck, description: "Price compare and orders" }]
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      { id: "financials", label: "Financials", icon: Wallet, description: "Revenue, credit, cash position", capability: "financials.read" },
      { id: "analytics", label: "Analyst", icon: Sparkles, description: "Findings and recommended actions", capability: "analyst.read" },
      { id: "reports", label: "Reports", icon: FileBarChart, description: "Sales, stock, buying and credit reports", capability: "reports.read" }
    ]
  },
  {
    id: "management",
    label: "Management",
    items: [
      { id: "staff", label: "Staff", icon: UserCog, description: "Team, invitations, roles", capability: "staff.read" },
      { id: "documents", label: "Documents", icon: FolderOpen, description: "Licences, invoices, records", capability: "documents.read" },
      { id: "import", label: "Import data", icon: Upload, href: "/import", description: "Spreadsheets and CSV", capability: "inventory.import" },
      { id: "settings", label: "Settings", icon: Settings, description: "Country, currency, payment methods, contact", capability: "pharmacy.settings.manage" }
    ]
  }
];

type Member = Parameters<typeof can>[0];

/** The navigation this person may use: items they lack the capability for are absent. */
export function navFor(user: Member): NavGroup[] {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.capability || can(user, i.capability)) })).filter((g) => g.items.length > 0);
}

/** Highest-frequency destinations, in thumb reach on phones. Everything else is under More. */
export const PHONE_PRIMARY: ScreenId[] = ["dashboard", "sales", "inventory", "customers"];

/** Destinations about the person rather than the pharmacy: reached from the account menu, open to everyone. */
export const ACCOUNT_GROUP: NavGroup = {
  id: "account",
  label: "Account",
  items: [{ id: "security", label: "Account security", icon: ShieldCheck, description: "Two-step verification, password, sign out" }]
};

export function findItem(id: string): { item: NavItem; group: NavGroup } | null {
  for (const group of [...NAV_GROUPS, ACCOUNT_GROUP]) {
    const item = group.items.find((i) => i.id === id);
    if (item) return { item, group };
  }
  return null;
}

/** The capability each workspace screen needs; screens not listed are open to every member. */
export const SCREEN_CAPABILITY: Partial<Record<ScreenId, Capability>> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.capability && !i.href).map((i) => [i.id, i.capability])
);

/** Whether this person may open a workspace screen (UX; the data is refused server-side anyway). */
export function canOpen(user: Member, screen: ScreenId): boolean {
  const cap = SCREEN_CAPABILITY[screen];
  return !cap || can(user, cap);
}
