/**
 * The canonical capability registry (Phase 11).
 *
 * The database is the authority: private.role_capabilities (migration 0020) is
 * what RLS and every RPC check through private.has_capability(). This file mirrors
 * it so the app can shape the UI, and supabase/tests/capabilities_parity.test.mjs
 * fails if the two ever differ. Hiding a button here is UX; refusing the request
 * is the server's job.
 *
 * Screens and components ask `can(user, "staff.invite")`, never `role === "owner"`.
 */
import type { Role } from "@/platform/domain";

export const CAPABILITIES = [
  "pharmacy.settings.read",
  "pharmacy.settings.manage",
  "staff.read",
  "staff.invite",
  "staff.manage",
  "staff.role.manage",
  "staff.audit.read",
  "sales.read",
  "sales.create",
  "customers.read",
  "customers.create",
  "customers.update",
  "customers.delete",
  "inventory.read",
  "inventory.adjust",
  "inventory.manage",
  "inventory.delete",
  "inventory.import",
  "suppliers.read",
  "suppliers.manage",
  "suppliers.delete",
  "purchase_orders.read",
  "purchase_orders.create",
  "purchase_orders.update",
  "purchase_orders.delete",
  "reminders.manage",
  "documents.read",
  "documents.manage",
  "reports.read",
  "analyst.read",
  "financials.read",
  "platform.admin"
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Staff: the counter, all day. */
const STAFF: Capability[] = [
  "pharmacy.settings.read",
  "sales.read",
  "sales.create",
  "customers.read",
  "customers.create",
  "customers.update",
  "inventory.read",
  "inventory.adjust",
  "inventory.manage",
  "suppliers.read",
  "suppliers.manage",
  "purchase_orders.read",
  "purchase_orders.create",
  "purchase_orders.update",
  "reminders.manage"
];

export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  staff: new Set(STAFF),
  owner: new Set(CAPABILITIES.filter((c) => c !== "platform.admin")),
  admin: new Set(CAPABILITIES)
};

/** Mirrors private.mfa_policy: who must use a second factor. */
export const MFA_REQUIRED_ROLES: ReadonlySet<Role> = new Set<Role>(["owner", "admin"]);

type HasRole = { role?: Role | string | null } | null | undefined;

/** True when the user's role grants the capability. UX only; the server decides. */
export function can(user: HasRole, capability: Capability): boolean {
  const role = user?.role as Role | undefined;
  if (!role || !(role in ROLE_CAPABILITIES)) return false;
  return ROLE_CAPABILITIES[role].has(capability);
}

export const mfaRequiredFor = (role?: string | null) => !!role && MFA_REQUIRED_ROLES.has(role as Role);
