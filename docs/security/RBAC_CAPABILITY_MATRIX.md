# RBAC capability matrix (Phase 11)

Authorization is organized around **capabilities**. A role is only a named bundle of
capabilities. The authority is the database:
- `private.capabilities` is the registry (32 capabilities);
- `private.role_capabilities` maps roles to capabilities;
- `private.has_capability(text)` is the single question every RPC and policy asks.

The app mirrors the same table in `client/src/platform/auth/capabilities.ts`, but only to shape
the UI. Two checks keep them honest:
- **`supabase/tests/capabilities_parity.test.mjs`** fails if the two registries differ.
- **The same test** also fails if any app code compares role names directly
  (`role === "owner"`).

Migration: `supabase/migrations/0020_capabilities_mfa.sql`. The baseline is in
[PHASE_11_BASELINE_AUDIT.md](PHASE_11_BASELINE_AUDIT.md).

## Roles

The roles are unchanged: there were three before Phase 11 and there are three now.

| Role | Who | Capabilities | MFA |
|---|---|---|---|
| `staff` | Counter staff of one pharmacy | 15 | Optional. Once enrolled it is always required for that person. |
| `owner` | Runs one pharmacy | 31 (all except `platform.admin`) | **Required** |
| `admin` | NevOut platform administrator, not a pharmacy role | 32 | **Required** |

No new roles were created. The pilot has no present need for "pharmacist-in-charge",
"technician" or "cashier" roles. With the registry, adding one is a data change:
- a new enum value;
- rows in `private.role_capabilities`;
- a row in `private.mfa_policy`;
- the mirror in `capabilities.ts`.

Nothing else in the app has to change, because the app never branches on role names.

## Server-side authorization in one line

A request succeeds only when all three conditions hold:
1. the caller's `users_profiles` row is **active**;
2. their session meets the **MFA assurance** their account needs (`private.mfa_satisfied()`);
3. their role **holds the capability**, for rows of **their own pharmacy**.

Tenant and role come only from `users_profiles`, keyed by `auth.uid()` from the signed JWT.
Four things are never trusted:
- browser role values;
- `localStorage`;
- a client-supplied `pharmacy_id`;
- `user_metadata`.

## Matrix

**Key:** ✓ granted · — denied.

**How each capability is enforced:**
- **RLS**: row-level policies.
- **RPC**: a `SECURITY DEFINER` function check.
- **EF**: the `staff-admin` Edge Function, which calls the RPC as the caller.
- **Storage**: `storage.objects` policies.

| Capability | staff | owner | admin | Enforced server-side by | UI when denied |
|---|---|---|---|---|---|
| `pharmacy.settings.read` | ✓ | ✓ | ✓ | RLS `pharmacies_select` (tenant) | — |
| `pharmacy.settings.manage` | — | ✓ | ✓ | RPC `update_pharmacy_settings`; RLS `pharmacies_update`; RLS `pharmacy_config_changes_select` | Settings absent from nav; "Only the pharmacy owner can open this" |
| `staff.read` | — | ✓ | ✓ | RLS `users_profiles_select` (team rows); RPC `staff_performance` | Staff absent from nav |
| `staff.invite` | — | ✓ | ✓ | RPCs `invite_staff`, `resend_staff_invitation`, `revoke_staff_invitation` (EF `invite`/`resend`/`revoke`); RLS `staff_invitations_select` | Invite button absent |
| `staff.manage` | — | ✓ | ✓ | `private.assert_can_manage` → RPCs `suspend_staff`, `reactivate_staff`, `remove_staff`, `reset_member_mfa` (EF). Also: not self, same pharmacy, never an admin, last owner protected. | Member actions absent |
| `staff.role.manage` | — | ✓ | ✓ | RPC `set_staff_role` (EF `set_role`) + `assert_can_manage` | "Make owner/staff" absent |
| `staff.audit.read` | — | ✓ | ✓ | RLS `staff_audit_log_select`; RLS `security_events_select` (pharmacy rows) | Staff see only their own security events |
| `sales.read` | ✓ | ✓ | ✓ | RLS `purchases_select`, `purchase_items_select` (tenant) | — |
| `sales.create` | ✓ | ✓ | ✓ | RPCs `record_purchase(_idempotent)`: `p_pharmacy_id` must equal the caller's | — |
| `customers.read` / `.create` / `.update` | ✓ | ✓ | ✓ | RLS tenant select / insert / update; RPC `create_customer_idempotent` | — |
| `customers.delete` | — | ✓ | ✓ | RLS `customers_delete` | No delete control |
| `inventory.read` | ✓ | ✓ | ✓ | RLS `products_select`, `inventory_select`, `stock_movements_select` | — |
| `inventory.adjust` | ✓ | ✓ | ✓ | RPCs `adjust_stock(_idempotent)` (no direct write grants) | — |
| `inventory.manage` | ✓ | ✓ | ✓ | RPCs `create_product(_idempotent)`, `update_product_checked`; RLS products insert/update | — |
| `inventory.delete` | — | ✓ | ✓ | RLS `products_delete` | No delete control |
| `inventory.import` | — | ✓ | ✓ | RPC `import_inventory_levels` (**new in 0020**, finding F1) | Import route redirects; menu item absent |
| `suppliers.read` / `.manage` | ✓ | ✓ | ✓ | RLS tenant select / insert / update on suppliers and supplier_catalogue | — |
| `suppliers.delete` | — | ✓ | ✓ | RLS `suppliers_delete`, `supplier_catalogue_delete` | No delete control |
| `purchase_orders.read` / `.create` / `.update` | ✓ | ✓ | ✓ | RLS tenant; RPC `create_purchase_order(_idempotent)` | — |
| `purchase_orders.delete` | — | ✓ | ✓ | RLS `purchase_orders_delete` | No delete control |
| `reminders.manage` | ✓ | ✓ | ✓ | RLS tenant select / insert / update / delete; RPC `create_reminder_idempotent` | — |
| `documents.read` | — | ✓ | ✓ | RLS `documents_select`; Storage `documents_objects_select` (**tightened in 0020**, finding F2) | Documents absent from nav |
| `documents.manage` | — | ✓ | ✓ | RLS documents insert / update / delete; Storage insert / update / delete | — |
| `reports.read` | — | ✓ | ✓ | **UI only** (see note) | Reports absent from nav |
| `analyst.read` | — | ✓ | ✓ | **UI only** (see note) | Analyst absent from nav |
| `financials.read` | — | ✓ | ✓ | RPC `financial_summary` | Financials absent; dashboard money figures hidden |
| `platform.admin` | — | — | ✓ | RPCs `admin_*`, `ops_health` (`private.is_admin()` = this capability); cross-tenant read branches in RLS | Admin console link absent; route redirects |

**Note on Reports and the Analyst.** Both views are computed in the browser from operational
rows that staff legitimately need for selling: sales, products, stock, and prices including
unit cost. Only the aggregates with no counter use (`financial_summary`, `staff_performance`)
are server-gated. Hiding operational data from staff to "enforce" `reports.read` would break
the counter, so these two capabilities are honest UI-only capabilities. That is recorded here
rather than disguised.

**Not capabilities, because no such operation exists:**
- sale correction or refund (`sales.correct`);
- separate expiry management (a write-off is `inventory.adjust`).

**Account security** (enrolling, replacing or removing your own authenticator, changing your
password) is **self-service for every role**. It is not a capability. Supabase Auth enforces
it: removing a verified factor needs an `aal2` session.

## Account status and assurance apply to everything

| State | Effect (server) |
|---|---|
| `suspended` / `removed` | Every helper returns NULL, so there is no tenant access and no capability at any AAL. The auth identity is also banned by the Edge Function. |
| MFA required or enrolled, session at `aal1` | `private.mfa_satisfied()` is false, so there is no tenant access and no capability. Only the caller's own profile row, `my_account_status()`, `my_security_posture()` and `record_security_event()` work. |
| Active, assurance met | Role capabilities, own pharmacy only |

## Tests

| Suite | What it proves |
|---|---|
| `70_capabilities_mfa.test.sql` (81 checks) | Registry integrity. Staff hold no privileged capability. The MFA gate (owner and admin at aal1 get nothing; optional staff; unverified factors ignored). Escalation attempts: self-promotion, own pharmacy change, owner RPCs, import, documents, audit, invitations, deletes, admin console. Client-edited JWT claims (`user_role`, `pharmacy_id`, `user_metadata`, `app_metadata`). Cross-tenant attacks. Suspended and removed users at aal2. Security-event validation and immutability. |
| `10_…60_*.test.sql` (354 checks) | Every earlier RLS, RPC, staff and offline guarantee, unchanged |
| `api_tenant_isolation.e2e.mjs` (41) | Direct PostgREST and RPC attacks across pharmacies with real JWTs |
| `api_staff_lifecycle.e2e.mjs` (47) | Invite, role change, suspend and offboard via the Edge Function; staff denied |
| `api_mfa.e2e.mjs` (35) | Real Supabase Auth MFA: an aal1 owner denied on PostgREST, RPC and Edge Function; the reset path and its refusals |
| `capabilities_parity.test.mjs` (6) | App mirror equals the database; no role-name comparisons in app code |
| `ui_mfa.e2e.mjs`, `ui_staff_lifecycle`, `ui_foundation` | Staff never see owner navigation. Owner screens refuse. The workspace stays locked until verification. |
