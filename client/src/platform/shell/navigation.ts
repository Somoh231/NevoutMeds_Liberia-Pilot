import type { LucideIcon } from "@/platform/ui/icons";
import { BellRing, ChartLine, FolderOpen, LayoutDashboard, Package, Truck, Upload, UserCog, Users, Wallet } from "@/platform/ui/icons";

/**
 * Information architecture (see docs/ux/UX_DECISIONS.md).
 *
 * Grouped by the job a pharmacist is doing, not by data table:
 *  - Operations: the counter, all day, every role.
 *  - Procurement: buying — supplier prices, orders.
 *  - Insights: money and trends — owner only.
 *  - Management: people, records, data — owner only.
 * Staff never see owner groups at all (not greyed out: absent), so their
 * navigation is five calm items. The platform admin console is not part of a
 * pharmacy's navigation; it lives in the account menu, visibly separate.
 */
export type ScreenId =
  | "dashboard"
  | "inventory"
  | "customers"
  | "reminders"
  | "suppliers"
  | "financials"
  | "analytics"
  | "staff"
  | "documents";

export type NavItem = {
  id: ScreenId | "import";
  label: string;
  icon: LucideIcon;
  /** Route-based destinations leave the workspace screen switcher. */
  href?: string;
  description?: string;
};

export type NavGroup = { id: string; label: string; ownerOnly?: boolean; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "operations",
    label: "Operations",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "What needs attention today" },
      { id: "inventory", label: "Inventory", icon: Package, description: "Stock levels, expiry, adjustments" },
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
    ownerOnly: true,
    items: [
      { id: "financials", label: "Financials", icon: Wallet, description: "Revenue, credit, cash position" },
      { id: "analytics", label: "Analytics", icon: ChartLine, description: "Trends and recommendations" }
    ]
  },
  {
    id: "management",
    label: "Management",
    ownerOnly: true,
    items: [
      { id: "staff", label: "Staff", icon: UserCog, description: "Team, invitations, roles" },
      { id: "documents", label: "Documents", icon: FolderOpen, description: "Licences, invoices, records" },
      { id: "import", label: "Import data", icon: Upload, href: "/import", description: "Spreadsheets and CSV" }
    ]
  }
];

export const isOwnerRole = (role?: string) => role === "owner" || role === "admin";

export function navFor(role?: string): NavGroup[] {
  return NAV_GROUPS.filter((g) => !g.ownerOnly || isOwnerRole(role));
}

/** Highest-frequency destinations, in thumb reach on phones. Everything else is under More. */
export const PHONE_PRIMARY: ScreenId[] = ["dashboard", "inventory", "customers", "reminders"];

export function findItem(id: string): { item: NavItem; group: NavGroup } | null {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.id === id);
    if (item) return { item, group };
  }
  return null;
}

export const OWNER_ONLY_SCREENS: ScreenId[] = ["staff", "financials", "analytics", "documents"];
