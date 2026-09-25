# Phase 11 baseline audit: identity, authorization, telemetry

Date: 2026-09-25 · Branch `phase8/ux-design-system` · Baseline commit `ed39400`. Production
serves `index-CpTWfeTG.js` with migrations `0001`–`0019`.

This records the system as it was **before** any Phase 11 change. The evidence comes from the
live local database (`pg_get_functiondef`, `pg_policies`), the source tree, and read-only
queries against production.

## 1. Role values

| Source | Values |
|---|---|
| Postgres enum `public.user_role` (0001) | `owner`, `staff`, `admin` |
| `staff_invitations.role` | `owner` or `staff` (check constraint `staff_invitations_role_not_admin`) |
| Front-end types (`domain.ts`, `db/types.ts`, `offline/session.ts`, `staffAdmin.ts`) | `"owner" \| "staff" \| "admin"` |
| **Production data** (read-only, service role, 2026-09-25) | `users_profiles`: **0 rows** · `staff_invitations`: 0 · `pharmacies`: 0 · `auth.users`: **0** |

There are **three** roles, not five:
- **`owner`:** runs one pharmacy.
- **`staff`:** does the counter work for one pharmacy.
- **`admin`:** a *platform* administrator, which is not a pharmacy role. An admin can read
  across tenants and cannot be invited or managed by an owner.

Production holds no accounts, so no existing user can be locked out by a change to the role or
MFA model.

**Account status** (`public.account_status`: `active`, `suspended`, `removed`) is separate from
role. It is the kill-switch that every helper checks.

## 2. Where roles are checked

### 2.1 Database helpers (`private` schema, all `SECURITY DEFINER`, `search_path = ''`)

| Helper | Definition (current) |
|---|---|
| `private.current_profile()` | caller's `(user_id, pharmacy_id, role)` where `status = 'active'` |
| `private.pharmacy_id()` | caller's `pharmacy_id` where `status = 'active'` |
| `private.user_role()` | caller's `role` where `status = 'active'` |
| `private.is_member_of(p)` | active member of pharmacy `p` |
| `private.is_owner()` | active and `role in ('owner','admin')` |
| `private.is_admin()` | active and `role = 'admin'` |
| `private.assert_can_manage(target)` | caller is an active owner or admin; target is in the same pharmacy, is not the caller, and is not an admin |

All derive tenant and role from `public.users_profiles` keyed by `auth.uid()`. **None** reads
`user_metadata`, a client-supplied `pharmacy_id`, or the JWT role claim.

The trigger `users_profiles_guard_mutation` → `private.guard_profile_mutation()` rejects any
change to `role`, `pharmacy_id` or `id` made by the `authenticated` or `anon` API roles. Column
grants also revoke `update (status, …)` from `authenticated`.

### 2.2 RLS policies (55 in `public` and `storage`)

| Pattern | Tables |
|---|---|
| **Select:** `is_admin() OR pharmacy_id = pharmacy_id()` | app_events, app_feedback, app_logs, customers, **documents**, inventory, pharmacies, products, purchase_items, purchase_order_items, purchase_orders, purchases, reminders, stock_movements, supplier_catalogue, suppliers |
| **Insert / update:** tenant only (any active member) | customers, products, inventory (update), purchase_order_items, purchase_orders (+ `created_by = auth.uid()`), reminders, supplier_catalogue, suppliers |
| **Delete:** tenant + `is_owner()` | customers, products, suppliers, supplier_catalogue, purchase_orders, documents |
| **Documents write:** tenant + `is_owner()` | documents insert/update/delete; `storage.objects` insert/update/delete in bucket `documents` under folder `<pharmacy_id>/` |
| **Owner-only select:** `is_admin() OR (tenant AND is_owner())` | staff_audit_log, staff_invitations, pharmacy_config_changes |
| `users_profiles` | select: self, admin, or `user_role() = 'owner'` for the same pharmacy. Update: self only, with the guard trigger and column grants limiting what can change. |
| `pharmacies` update | tenant + `is_owner()`, column grant limited to contact fields |
| `mutation_receipts` | select: tenant only |

`purchases`, `purchase_items`, `stock_movements` and `inventory` have **no** insert policy.
They are written only by `SECURITY DEFINER` RPCs.

### 2.3 RPCs (`public`, `SECURITY DEFINER`)

| RPC | Authorization today |
|---|---|
| `record_purchase(_idempotent)`, `adjust_stock(_idempotent)`, `create_product(_idempotent)`, `update_product_checked`, `create_customer_idempotent`, `create_reminder_idempotent`, `create_purchase_order(_idempotent)`, `pharmacy_country_context` | active member; `p_pharmacy_id` must equal `private.pharmacy_id()` |
| **`import_inventory_levels`** | **active member** (see finding F1) |
| `financial_summary`, `staff_performance` | `private.user_role() in ('owner','admin')` |
| `invite_staff`, `resend_staff_invitation`, `revoke_staff_invitation` | inline profile query: `role in ('owner','admin')`; invitations can never grant `admin` |
| `suspend_staff`, `reactivate_staff`, `remove_staff`, `set_staff_role` | `private.assert_can_manage`, plus last-active-owner protection (remove and role change) |
| `update_pharmacy_settings` | `private.is_owner()` |
| `accept_staff_invitation` | token only; `pharmacy_id` and role come from the invitation row |
| `onboard_pharmacy`, `onboard_new_pharmacy` | caller without a profile creates their pharmacy and becomes `owner` |
| `admin_pilot_overview`, `admin_usage_snapshot`, `admin_pilot_success_dashboard` | `is_admin()` |
| `ops_health` | `is_admin()` or `auth.role() = 'service_role'` |
| `my_account_status` | self (status only) |

### 2.4 Edge Function `staff-admin`

This is the only place the service-role key is used. It exists for the two things the database
cannot do itself: sending invitation email, and banning or unbanning an auth identity.

Every action first calls the matching RPC **as the caller** (the caller's own JWT, anon key).
Only if that RPC succeeds does it use the service role. **Consequence:** any database-level check
on the JWT (for example `auth.jwt()->>'aal'`) automatically applies to this function too.

### 2.5 Front end (UX only)

| Location | Check |
|---|---|
| `shell/navigation.ts` | `isOwnerRole(role)` (`owner` or `admin`) filters the `ownerOnly` nav groups; `OWNER_ONLY_SCREENS` = staff, financials, analytics, reports, documents, settings |
| `pages/NevoutmedsApp.jsx` | `isOwner` gate for owner screens, plus a "not available" panel for staff |
| `features/dashboard/DashboardScreen.jsx` | `isOwner` shows the 30-day revenue and stock value |
| `features/staff/StaffScreen.jsx` | `isOwner` for invite, manage and audit; `m.role !== "admin"` |
| `data/useFinancialSummary.ts` | `role in (owner, admin)` before calling the RPC |
| `shell/AppShell.tsx` | owner items and the `role === "admin"` admin-console link |
| `auth/RequireRole.tsx` → `AdminConsolePage` | `allow={["admin"]}` |
| `pages/ImportPage.tsx` | owner check |
| `auth/roles.ts` | `getUserRole()` returns `"staff"` until the profile loads (least privilege); never reads `user_metadata` |

That is **20+ scattered `role ===` / `isOwner` checks** across 9 files, with no single
registry.

### 2.6 Database constraints

`user_role` enum; `staff_invitations_role_not_admin`; `users_profiles.pharmacy_id` foreign key;
the guard trigger. There is no capability concept anywhere.

## 3. Staff lifecycle (Phase 4, migrations 0014–0015)

| Step | Mechanism |
|---|---|
| Invite | Owner → `staff-admin` `invite` → `invite_staff` RPC (as caller). A token is stored hashed with an expiry; `auth.admin.inviteUserByEmail` is best-effort; the link is always returned so it can be sent on WhatsApp. |
| Accept | Invitee signs up or signs in → `accept_staff_invitation(token)`. The profile is created from the invitation row; the role can never be `admin`. |
| Change role | `set_staff_role` via `assert_can_manage`. Not self, not an admin, and the last active owner cannot be demoted. |
| Suspend | `suspend_staff` sets status to `suspended`, and the Edge Function bans the auth identity (~100 years). Every helper then returns NULL, so all tenant access stops at once. The client's `my_account_status` check signs the person out. |
| Reactivate | `reactivate_staff` + unban |
| Offboard | `remove_staff` sets status to `removed` + ban. The last active owner cannot be removed. |
| Audit | `private.audit_staff` → `staff_audit_log` (append-only for clients; owner-readable) |

## 4. Auth session model

- **Credentials:** Supabase Auth email + password. The JWT expires after 1 h, with refresh-token
  rotation. supabase-js persists the session in `localStorage`.
- **Profile:** `AuthProvider` resolves the profile from `users_profiles` (trusted) and caches a
  **profile snapshot** in IndexedDB for offline start. The server still authorizes every queued
  write.
- **Account status:** `my_account_status()` is checked on start and on every auth event;
  `suspended` or `removed` signs the user out.
- **Local config:** `supabase/config.toml` has `[auth.mfa.totp] enroll_enabled = false,
  verify_enabled = false`. Its comment says MFA needs the Pro plan, which is **incorrect for
  TOTP**: Supabase TOTP is free and enabled by default on hosted projects. **MFA has never been
  used**, and no code references `auth.mfa`.
- **Realtime token handoff:** supabase-js hands a new token to Realtime only on `SIGNED_IN` and
  `TOKEN_REFRESHED`, **not** on `MFA_CHALLENGE_VERIFIED`.

## 5. Security settings UI

There is **no account security surface**. Password handling:
- **Forgot:** `/forgot-password` sends email (SMTP is still pending in production).
- **Reset:** `/reset-password` via `updatePassword`.

Pharmacy **Settings** (owner-only) covers the pharmacy's details, country and payment methods,
not the person. The account menu has Help & feedback, the admin console (admins only) and Sign
out.

## 6. Telemetry and error handling

| Piece | Behaviour |
|---|---|
| `reliability/ErrorBoundary.tsx` | One root boundary in `main.tsx`: `logError` (console) + `logErrorToDb` → `app_logs` (message + component stack, no user or pharmacy id). `ops_health` counts these as "client errors". |
| `reliability/logging.ts` | Comment: "hook point for Sentry/Datadog later" |
| `reliability/telemetry.ts` | `trackEvent` → `app_events` (route views, tenant-scoped); `submitFeedback` → `app_feedback` |
| Unhandled promise rejections | **Not captured** |
| Sync engine (`offline/sync.ts`) | Logs failures to `app_logs`; conflicts surface in "Needs attention" |
| Ops | `ops/monitor/health-check.mjs` + `ops_health()`: site, API, Edge Function, backups, client errors, sync conflicts and failures, storage failures, integrity, silent pharmacies |

There is no third-party monitoring and no third-party hosts; the Phase 11 home page states
"0 third-party trackers".

## 7. Bundle composition (main chunk, `index-*.js`)

Total 161.2 kB gzip; 532.9 kB raw from source maps.

| Package | Raw kB | Share |
|---|---|---|
| react-dom | 126.9 | 23.8 % |
| app code | 115.6 | 21.7 % |
| @supabase/auth-js | 88.8 | 16.7 % |
| @tanstack/query-core | 37.2 | 7.0 % |
| @supabase/realtime-js + phoenix | 52.7 | 9.9 % |
| @supabase/storage-js | 20.2 | 3.8 % |
| lucide-react | 20.1 | 3.8 % |
| @supabase/postgrest-js | 15.7 | 2.9 % |
| react-router (+ @remix-run/router) | 17.4 | 3.3 % |

`auth-js` already contains the MFA client, so TOTP adds only screen code.

## 8. Findings that shape Phase 11

| # | Finding | Severity | Phase 11 action |
|---|---|---|---|
| F1 | `import_inventory_levels` accepts any active member, while the UI restricts Import to owners. Staff can already adjust stock by any amount, so this is **not** an escalation beyond staff rights, but the server does not enforce the product decision. | Low | Enforce `inventory.import` in the RPC |
| F2 | **Documents** are hidden from staff in the UI, but RLS (`documents_select`, `documents_objects_select`) lets any member read them, including staff employment contracts. | Medium (privacy) | Enforce `documents.read` server-side |
| F3 | There is no MFA at all, including for owners and the platform admin. | High for go-live | TOTP, enforced in the database for owner and admin |
| F4 | Role checks are scattered: 7 helpers, 12 owner policies, 9 RPCs, 20+ front-end checks. | Maintainability | A capability registry in the DB and TS, with a parity test |
| F5 | Unhandled promise rejections are not captured, and nothing gives code-level diagnosis. | Medium | Sentry, privacy-first, lazy-loaded |
| F6 | Realtime keeps the pre-MFA token after `MFA_CHALLENGE_VERIFIED`. | Would break realtime after verification | Call `realtime.setAuth` after verify |
| F7 | Reports and Analyst are computed in the browser from operational rows that staff can legitimately read (sales, products including unit cost). Only `financial_summary` and `staff_performance` are server-gated. | Accepted / documented | Documented in the capability matrix; not "fixed" by hiding data staff need for selling |
| F8 | The local `config.toml` disables TOTP and its comment is wrong about the plan. | Tooling | Enable locally and correct the comment |

## 9. Assumptions challenged

- **"Five roles":** not created. There is no present product need; the capability registry makes
  future roles a data change, not a code change.
- **"Owners should need MFA for everything":** yes. The assurance gate sits in the tenant helpers
  every policy and RPC already uses. An owner with only a password (aal1) therefore gets **no
  tenant access at all**, not just "no privileged actions". A stolen owner password would
  otherwise still expose customer names and phone numbers.
- **"MFA breaks offline":** no. Sessions verified with MFA keep `aal2` across refreshes. The only
  offline limitation is that a second factor cannot be *verified* offline, which is correct.
