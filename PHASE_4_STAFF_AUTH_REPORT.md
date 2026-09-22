# NevOut Meds — Phase 4 Report: Staff lifecycle & production auth

Date: 2026-09-22
Backend: Supabase project `qohpyeqyveusnxhnbtxz` — **nothing deployed to the remote project.** All work is local.

## Gate status: **PASS**

| Gate | Result |
|---|---|
| **Real GoTrue login through the production path** | **PASS** — HTTP 200 in ~0.1 s (root cause of the old 502 found and fixed) |
| Migrations `0001` → `0016` on a **fresh** database | 16/16 apply, no manual steps |
| SQL suites (Phase 2 + 3 + 4) | **215 checks, 0 failed** (83 security · 42 correctness · 90 staff/auth) |
| API suites (PostgREST + Storage + Edge Function, real logins) | **89 checks, 0 failed** (41 + 48) |
| UI suites (real browser, real form login) | **32 checks, 0 failed** (15 + 17) |
| `npm run build` | passes |
| Service-role key absent from client source and bundle | verified |

**Total: 336 executable checks, 0 failing.**

---

## 1. The GoTrue 502 — diagnosed, not worked around

**Root cause: my own Phase 2/3 test fixtures, not the infrastructure.**

I had created `auth.users` rows with raw SQL. That leaves columns NULL which GoTrue scans into
non-nullable Go types, so *every* password grant failed before it ever reached password checking:

```
error finding user: sql: Scan error on column index 3, name "confirmation_token":
converting NULL to string is unsupported
error finding user: sql: Scan error on column index 5, name "created_at":
unsupported Scan, storing driver.Value type <nil> into type *time.Time
```

The ~18 s delay was Kong retrying the failing upstream; GoTrue itself failed in **0.04 s**. Ruled
out by direct measurement: Kong routing (the same call fails identically inside the network),
GoTrue migration state (healthy, v2.197.0, 27 auth tables), config/env (unchanged), Docker pressure
(load is normal now), and stale images.

**Fix:** users are created through the GoTrue admin API, never by SQL insert. `supabase/tests/seed_e2e.sh`
does this and documents why. Evidence now, through Kong → GoTrue:

| Flow | Result |
|---|---|
| Owner email/password login | **200**, access + refresh token, `authenticated` claims |
| Staff login | **200** |
| Invalid password | 400 `invalid_credentials` |
| Unknown account | 400 |
| Session refresh (what a reload does) | **200** |
| Logout (`scope=global`) | 204, and the refresh token is then rejected |
| Password reset request (`/recover`) | **200** |
| Suspended user login | 400 `user_banned` |
| Suspended user refresh | 400 |
| Offboarded user login | 400 |

The app's own login form was also driven in a real browser: owner and staff both sign in and land in
`/platform`, with no injected session anywhere. The earlier injected-session technique has been
removed from the Phase 3 UI tests too — **every suite now authenticates for real**.

## 2. Auth architecture

```
browser (anon key only)
   │  email + password
   ▼
Kong ──► GoTrue ──► auth.users              ← identity, sessions, bans, reset emails
   │
   │  JWT (sub, role=authenticated)
   ▼
PostgREST ──► RLS policies ──► private.* helpers ──► users_profiles (tenant + role + status)
   │
   └─► staff-admin Edge Function (service-role key, server-side only)
```

* The browser holds **only** the anon key. `grep` over `client/src` and the built `dist/` finds no
  service-role reference, and the service token does not appear in the bundle.
* Tenant and role are never taken from the client or from `user_metadata`; they come from
  `users_profiles`, which the API cannot write.
* **Account status is the master switch.** Every `private.*` helper resolves a tenant only for an
  `active` profile, so suspension instantly removes access to every table and RPC.

## 3. Staff invitation architecture

1. Owner invites (name, email, role) → Edge Function → `invite_staff()` **as the caller**.
2. The RPC verifies the caller is an active owner, refuses `admin`, validates the address, refuses
   duplicates, supersedes any previous live invitation, and creates a row binding
   **pharmacy_id + role + inviter + email + expiry (7 days, max 30)**.
3. A 32-byte random token is generated; only its **SHA-256 hash** is stored. The plaintext is
   returned exactly once — the database cannot reveal it later.
4. The function emails the invitee (Supabase Auth) and returns the one-time link, so an owner can
   also send it by WhatsApp — how most Liberian pilots actually work.
5. The invitee signs in and `accept_staff_invitation(token)` provisions the profile server-side.

Acceptance fails safely for: already used, expired, revoked, wrong email, malformed/empty token,
unknown token, an account that already belongs to a pharmacy, and a member of another pharmacy
trying to consume the invite. Each case is tested.

## 4. Role model (deliberately small — no `manager`)

| Role | Meaning |
|---|---|
| `admin` (**platform admin**) | NevOut staff. Cross-tenant **read** for support. Never creatable or grantable by a pharmacy owner; not manageable from the staff screen. |
| `owner` | Pharmacy owner. Full pharmacy rights plus staff management and settings. |
| `staff` | Day-to-day pharmacy user. |

A `manager` tier was not added: nothing in the current product needs a right that sits between staff
and owner, and an unused role is a permission surface with no payoff.

## 5. Permissions matrix (enforced by RLS/RPC, not by hiding UI)

| Area | staff | owner | platform admin |
|---|---|---|---|
| Inventory — view | own pharmacy | own pharmacy | all (read) |
| Inventory — adjust stock (RPC) | ✅ | ✅ | ❌ outside own pharmacy |
| Inventory — create product (RPC) | ✅ | ✅ | ❌ outside own pharmacy |
| Inventory — batch/expiry edit | ✅ | ✅ | ❌ |
| Inventory — delete product | ❌ | ✅ | ❌ |
| Purchases — view / record (RPC) | ✅ | ✅ | read only |
| Purchases — direct table writes | ❌ (RPC only) | ❌ (RPC only) | ❌ |
| Customers — view / create / update | ✅ | ✅ | read only |
| Customers — delete | ❌ | ✅ | ❌ |
| Suppliers & catalogue — view / create / update | ✅ | ✅ | read only |
| Suppliers — delete | ❌ | ✅ | ❌ |
| Purchase orders — create (RPC) / update | ✅ | ✅ | ❌ |
| Purchase orders — delete | ❌ | ✅ | ❌ |
| Reminders — full | ✅ | ✅ | read only |
| Documents — view | ✅ | ✅ | read only |
| Documents — upload / edit / delete (+ storage objects) | ❌ | ✅ | ❌ |
| Reports & financials (`financial_summary`) | ❌ | ✅ | ❌ (own pharmacy only) |
| Staff performance (`staff_performance`) | ❌ | ✅ | ✅ own pharmacy |
| Staff management (invite/suspend/role/offboard) | ❌ | ✅ | ❌ via this path |
| Audit log — read | ❌ | ✅ own pharmacy | ✅ |
| Audit log — write/edit/delete | ❌ | ❌ | ❌ (definer flows only) |
| Settings (pharmacy profile) | ❌ | ✅ own pharmacy | ❌ |
| Admin console RPCs | ❌ | ❌ | ✅ |
| Anything in another pharmacy | ❌ | ❌ | read only |

## 6. Server-side provisioning design

`supabase/functions/staff-admin/index.ts` is the only place a service-role key exists
(`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`, never `VITE_*`). For every action it:

1. requires a bearer token and resolves the caller with `auth.getUser()`;
2. calls the matching SECURITY DEFINER RPC **as that caller**, so the database makes the decision;
3. only then uses service-role for what the database cannot do: sending the invite email, and
   banning/unbanning the auth identity.

Redirects are constrained to an allow-list (`NEVOUT_ALLOWED_APP_ORIGINS`); an `app_origin` of
`https://evil.example.com` is ignored and the default origin used instead — tested, so there is no
open redirect in the invitation link.

## 7. Session & suspension behaviour

Suspension is enforced in two independent layers:

* **Database:** helpers stop resolving a tenant → every table returns nothing and every RPC raises.
  Proven with the *same JWT the user already had*: reads return 0 rows and `record_purchase` fails,
  with no re-login involved.
* **Auth:** the identity is banned, so sign-in returns `user_banned` and refresh tokens are rejected.

Verified in the browser as well: a signed-in staff member who is suspended out-of-band is bounced to
`/login` on the next navigation, because `my_account_status()` ends the client session. Offboarding
behaves the same and is permanent. A check also confirms **no pharmacy API responses are cached** by
the service worker, so switching accounts cannot expose the previous tenant's data.

## 8. Audit trail

`staff_audit_log` records `pharmacy_id`, actor (id + email), target (id + email), action,
`previous_value`, `new_value`, timestamp — for invitation created/resent/revoked/accepted, role
changed, user suspended/reactivated/removed. Owners read their own pharmacy's log; staff and other
pharmacies see nothing; **nobody** can insert, update or delete it through the API. The owner's Staff
screen shows it as a plain-language activity list.

## 9. Requirement classification

| § | Requirement | Status |
|---|---|---|
| 1 | Real auth revalidated (signup/login/logout/restore/refresh/reset/invalid/suspended) | **FIXED** |
| 2 | Owner-driven invitation with pending/accepted/expired/revoked status, securely bound | **FIXED** |
| 3 | Trusted server-side provisioning, no service key in browser | **FIXED** |
| 4 | Role model + permissions matrix, server-enforced | **FIXED** |
| 5 | Staff acceptance flow with all failure modes | **FIXED** |
| 6 | Staff management (invite/resend/revoke/suspend/reactivate/role/offboard) with history preserved | **FIXED** |
| 7 | Suspension/offboarding ends access immediately, including live sessions | **FIXED** |
| 8 | Role changes owner-authorised, validated, audited, tenant-safe | **FIXED** |
| 9 | Password recovery, expired/malformed links, constrained redirects | **FIXED** (reset request + update verified end-to-end; expired-link UI path is handled but exercised only by an invalid-session case) |
| 10 | Session security incl. cross-tenant and offline-cache leakage | **FIXED** |
| 11 | Audit log, immutable for ordinary users | **FIXED** |
| 12 | Executable tests (all 20 listed) | **FIXED** |
| 13 | Phase 2/3 regression | **FIXED** — no weakening; suites re-run green |
| 14A | WhatsApp wording | **FIXED** — the dashboard no longer claims "sent to +231771234100"; it copies the text and opens WhatsApp. Reminders read "Reminded" / "Open WhatsApp" / "Mark all as reminded". |
| 14B | Import row-level errors | **FIXED** — product/customer imports now report grouped reasons with row numbers (e.g. "missing phone, last_name (rows 4, 9)"), parser hardening untouched. |

### The 20 required tests

All present and passing: 1 owner invites ✅ · 2 cannot invite into another pharmacy ✅ · 3 staff cannot
invite ✅ · 4 owner cannot create admin ✅ · 5 single-use token ✅ · 6 expired ✅ · 7 revoked ✅ ·
8 correct pharmacy_id ✅ · 9 correct role ✅ · 10 no self-promotion ✅ · 11 cannot change pharmacy_id ✅ ·
12 suspend ✅ · 13 suspended loses access (live session) ✅ · 14 reactivate ✅ · 15 offboarded blocked ✅ ·
16 attribution retained ✅ · 17 A cannot reach B ✅ · 18 password reset through real auth ✅ ·
19 logout/session expiry ✅ · 20 real email/password login ✅.

## 10. Remaining blockers and notes

| Item | Status | Note |
|---|---|---|
| Edge Function deployment | **NOT VERIFIED** in cloud | Runs locally via `supabase functions serve`. It must be deployed (`supabase functions deploy staff-admin`) with `SUPABASE_SERVICE_ROLE_KEY` and `NEVOUT_ALLOWED_APP_ORIGINS` set for the real domain before pilot. |
| Invite email delivery | **MITIGATED** | Local mail goes to Inbucket. Production needs real SMTP configured in Supabase Auth; until then the one-time link (WhatsApp) is the reliable channel — which is the intended pilot workflow anyway. |
| Expired reset link | **MITIGATED** | The page handles "no session" by offering a new link; a genuinely expired recovery token was not exercised (GoTrue would need an aged token). |
| Owner self-signup | **OPEN (by design)** | Any authenticated user without a profile can still create their own pharmacy via `onboard_new_pharmacy`. Correct for pilot self-signup, but it means a revoked invitee can create a *separate* tenant. Worth gating before public launch. |
| `react-router` advisories | **MITIGATED** | 2 moderate, v7-only fix; redirects are never taken from URL parameters. |
| Local Docker | **MITIGATED** | Healthy after Phase 3 clean-up (`docker exec` ~0.2 s). The auth container needed one restart after the DB reset so GoTrue could re-run its migrations. |

**Next major roadmap item (recorded, not started):** UI/UX enhancement with a reusable design system,
multi-tenant polish, advanced auth UX, multi-country/multi-currency configuration, localisation and
regulatory layers — to be built on this secured architecture.

Nothing has been committed — all changes remain in the working tree.
