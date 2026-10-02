# Phase 11: MFA, RBAC hardening and production observability

Date: 2026-09-25 · Branch `phase8/ux-design-system` · Baseline `ed39400` (production at the
start of this phase).

Everything was built and verified on the local stack with synthetic data, then **deployed to
production on 2026-09-25** (see [Production](#production)).

**Documents from this phase:**
- **Baseline:** [docs/security/PHASE_11_BASELINE_AUDIT.md](docs/security/PHASE_11_BASELINE_AUDIT.md)
- **RBAC:** [docs/security/RBAC_CAPABILITY_MATRIX.md](docs/security/RBAC_CAPABILITY_MATRIX.md)
- **MFA operations:** [docs/security/MFA_OPERATIONS.md](docs/security/MFA_OPERATIONS.md)
- **Monitoring privacy:** [docs/observability/SENTRY_PRIVACY_POLICY.md](docs/observability/SENTRY_PRIVACY_POLICY.md)
- **Roadmap:** [docs/roadmap/EPRESCRIBING_ARCHITECTURE.md](docs/roadmap/EPRESCRIBING_ARCHITECTURE.md),
  [docs/roadmap/PATIENT_PORTAL_ARCHITECTURE.md](docs/roadmap/PATIENT_PORTAL_ARCHITECTURE.md)
- **Hosting:** [docs/architecture/HOSTING_DECISION_RECORD.md](docs/architecture/HOSTING_DECISION_RECORD.md)

## Baseline findings that shaped the phase

- **Roles:** there are **three** roles (`owner`, `staff`, `admin`), not five. Production holds
  **0** profiles and **0** auth users (read-only check), so no existing person could be locked
  out.
- **Authorization:** it already derives only from `users_profiles` (never `user_metadata`,
  client ids or the JWT role) and is status-aware. The weakness was *organization*: 7 helpers,
  12 owner policies, 9 RPCs and 20+ scattered front-end `role ===` checks.
- **F1:** `import_inventory_levels` accepted any member, although the UI restricted it to
  owners.
- **F2:** staff could read stored **documents**, including staff contracts, through RLS and
  Storage, although the UI hid them.
- **F3:** there was no MFA anywhere.
- **F5:** unhandled rejections were not captured, and nothing gave code-level diagnosis.
- **F6:** supabase-js does not hand Realtime the new token after `MFA_CHALLENGE_VERIFIED`.

## MFA

**Implementation.** TOTP through **Supabase Auth**: `auth.mfa.enroll`, `challengeAndVerify`,
`listFactors`, `unenroll`, plus the admin factor API for supervised resets. There is **no custom
OTP**, and NevOut never stores the secret, QR payload, codes or a "verified" flag. The session's
signed `aal` claim is the only source.

**Enforcement is in the database.** Migration `0020` adds `private.mfa_satisfied()` to the
helpers every RLS policy and RPC already used. An account whose role requires MFA, or that has
enrolled a verified factor, gets **no tenant access at aal1**. That covers PostgREST, RPCs,
Storage and the `staff-admin` Edge Function, which calls RPCs with the caller's JWT. A stolen
owner password alone reaches no customer data.

| Role | MFA |
|---|---|
| Pharmacy owner | **Required** |
| Platform admin | **Required** |
| Staff | Optional. Once enrolled, it is always required for them. |

Policy lives in `private.mfa_policy`; making MFA mandatory for everyone is a one-line update.

**User experience** (UI/UX Pro Max's WCAG 2.2 "accessible authentication" guidance, and two
21st.dev 2FA-card patterns):
- **First owner sign-in:** "Protect your pharmacy", in three numbered steps (get an app; scan the
  QR code or type the grouped key, with a copy button; enter the code). Then a confirmation with
  lost-phone advice, and the workspace opens on **Continue**.
- **Later sign-ins:** password, then one numeric `one-time-code` field that accepts paste and
  autofill. **Lost your phone?** explains the supervised recovery. There is no bypass.
- **Account security** (account menu, all roles): status (On / Off / Required · not set up);
  Set up, Replace (the new factor is confirmed before the old one is removed), and Remove (only
  where optional, or when another factor remains); change password; sign out; security activity.
- **Staff → Reset two-step:** the owner resets a staff member's authenticator after confirming
  identity. It goes through the Edge Function, with the RPC authorizing first.
- **Offline:** verified sessions keep `aal2` across refresh and keep working offline. The code
  step says it needs the internet. **The offline queue is replayed only after verification**,
  so saved work is never turned into "failed".

**Recovery** ([MFA_OPERATIONS.md](docs/security/MFA_OPERATIONS.md) §4). Password recovery and MFA
recovery are separate, and there are no recovery codes or security questions.
- **Staff:** their owner resets it in the app, after an in-person or call-back identity check.
- **Owners and admins:** NevOut support runs `ops/security/reset-mfa.mjs`, which:
  - requires a ticket and the identity-verification method;
  - refuses staff, and suspended or removed accounts;
  - deletes the factors through the Auth admin API;
  - records an operator security event and writes a gitignored ops log.

Measured: an old session on the lost device drops to aal1 at its next refresh (within an hour)
and reaches nothing. Supabase has no admin sign-out-by-id endpoint (it returned 404 when tested),
so the tool does not claim one.

**Audit events** (`public.security_events`, append-only; codes and secrets never recorded):

| Event | Recorded by |
|---|---|
| enrollment started / factor verified / factor removed / challenge failed | App; validated against `auth.mfa_factors`, rate-limited |
| privileged user without MFA | Server, at most once a day |
| reset | Owner via RPC, or operator via the tool |

Owners see their pharmacy's events; staff see only their own.

**Tests:**
- `api_mfa` **35/35**: real Supabase Auth; wrong code; fake challenge and factor; refresh keeps
  aal2; sign-out; aal1 cannot remove a verified factor; first enrollment; staff opt-in; reset
  path and refusals; no secrets in the log.
- `ui_mfa` **43/43**: the code screen (a11y, wrong code, reload, offline, lost phone); Account
  security at 360, 430, 768 and 1366 px (axe, no pan, no small text); owner cannot remove their
  last factor; staff opt-in via the UI and keyboard-only sign-in; owner reset from Staff; no MFA
  flag in `localStorage`; the browser's aal1 token reaches no data.
- `ui_owner_provisioning` **12/12**: a new owner must enroll before the workspace, through the
  real setup screen.
- `ui_foundation` **55/55**: keyboard-only sign-in including the code step.
- `70_capabilities_mfa.test.sql`: gate semantics.

## RBAC

**Previous model.** Three roles, correctly enforced server-side, but expressed as role-name
checks everywhere.

**New model.**
- **Registry:** a canonical registry of **32 capabilities** derived from the real application.
  Roles map to capabilities in `private.role_capabilities`:

  | Role | Capabilities |
  |---|---|
  | staff | 15 |
  | owner | 31 |
  | admin | 32 |

- **Server:** `private.has_capability()` is the single question asked. `is_owner()` and
  `is_admin()` are now expressed through it.
- **App:** `client/src/platform/auth/capabilities.ts` mirrors the registry for UX, through
  `can(user, "staff.invite")`, capability-driven navigation, `canOpen(screen)` and
  `RequireCapability`.
- **Parity test:** it fails if the app and database registries differ, **and** if any app code
  compares role names again.
- **Roles:** no new roles were created, because there is no present need. Adding one is a data
  change.

**Server enforcement.** Migration `0020`:
- rewrites the owner-gated RLS policies and 9 RPCs to name their capability (generated from the
  live definitions, changing only the authorization lines);
- tightens **F1** (import is now owner-only in the RPC);
- tightens **F2** (documents and their Storage objects are owner-only);
- adds `my_security_posture()`, `record_security_event()` and `reset_member_mfa()`.

Reports and the Analyst remain UI-only capabilities, documented honestly. They are computed
from operational data staff need for selling.

**Tests:**
- `70_capabilities_mfa.test.sql`: **81** new checks covering the registry; the MFA gate;
  escalation attempts (staff self-promotion; own pharmacy change; owner RPCs; import; documents;
  audit; invitations; deletes; admin console); **client-edited JWT claims** (`user_role`,
  `pharmacy_id`, `user_metadata`, `app_metadata`); **cross-tenant** PostgREST and RPC attacks;
  **suspended and removed at aal2**; security-event validation and immutability.
- All **435** SQL checks pass on a **clean database built from migrations**.
- `api_tenant_isolation` 41/41, `api_staff_lifecycle` 47/47, `capabilities_parity` 6/6.

## Sentry

| | |
|---|---|
| SDK | `@sentry/react` **11.0.0** (current; React 18 supported), **lazy-loaded** in its own 33.4 kB gzip chunk, only when a DSN is set, online and idle. **Not precached** by the service worker. |
| Build plugin | `@sentry/vite-plugin` 5.4.0. Source maps are uploaded **only** when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` exist on the build, then deleted from the output. |
| Integrations enabled | `dedupe`, `linkedErrors`, `functionToString`, `eventFilters`. Default integrations are off. |
| Integrations rejected | breadcrumbs, supabase, httpClient, browserTracing / all tracing, browserSession, **replay / replayCanvas (not installed)**, feedback, captureConsole |
| Privacy | SDK v11 `dataCollection`, all off (its replacement for `sendDefaultPii: false`). No breadcrumbs. No `setUser`. `beforeSend` → `scrubEvent()` removes user, request data, cookies, headers, query strings, frame variables and source lines, and redacts JWTs, bearer tokens, keys, TOTP secrets, `otpauth`, emails, phones and personal JSON fields. Tags are route, role category, a **one-way tenant pseudonym**, device class, online and area. |
| Captured | Render errors (root boundary); uncaught exceptions; unhandled rejections; unexpected query and mutation failures; Edge Function 5xx; sync-engine exceptions and repeated server failures (type and codes only); import save failures; unexpected Auth failures |
| Filtered | Wrong password or code; validation; duplicates; permission refusals; conflicts; 401 / 403 / 409 / 413 / 415 / 422; **anything offline**; network drops |
| Offline | Monitoring is never a dependency. Tested: endpoint down, endpoint unreachable from startup, offline start with a DSN. The app keeps working and nothing is sent offline. |
| Tests | `sentry_privacy` **38/38** (unit). `ui_sentry` **26/26** in a real browser against a mock ingest server: scrubbed arrival; expected errors not sent; pseudonymous tags; failure modes; no Replay code; not precached; no auth token; no public maps. |

**Bundle impact:**

| | Size (gzip) |
|---|---|
| Main JS before | 161.2 kB |
| Main JS after | **163.03 kB** (+1.8 kB for MFA posture, the capability registry and the monitoring shim) |
| Target | ~165 kB, met |

The Sentry SDK (33.4 kB), the MFA gate (1.5 kB), setup (2.9 kB) and Account security (3.6 kB)
are all lazy chunks. To keep the main bundle small, the MFA code is split into posture (main)
and actions (lazy).

**Existing monitoring is unchanged:** `ops_health`, the health check and the backup heartbeat.
Better Stack was **not** added; it is recorded as a future option in the hosting decision
record.

## Regression

Local stack, synthetic data, final code:

| Gate | Result |
|---|---|
| SQL, clean database from migrations 0001–0020 | **435/435** (354 existing + 81 new) |
| Upgrade path | `0020` applied to the existing local database. It is re-runnable (idempotent re-application verified). |
| UI suites | ui_premium 18 · ui_core_flows 81 · ui_foundation 55 · ui_staff_lifecycle 17 · ui_workflows 15 · ui_phase8_correctness 14 · ui_offline_first 21 · ui_offline_sale_stock 25 · ui_recovery 26 · ui_import 32 · ui_country_pilots 46 · ui_owner_provisioning 12 · **ui_mfa 43** · **ui_sentry 26** |
| API suites | api_tenant_isolation 41 · api_staff_lifecycle 47 · api_realtime_offline 25 · **api_mfa 35** |
| Unit / parity / privacy / contrast | country_config 77 · capabilities_parity 6 · sentry_privacy 38 · design tokens 27 |
| Production build | OK. Main JS 163.03 kB gzip. |

**Final full run (2026-09-25, final code): all green.**

| Group | Checks | Failures |
|---|---|---|
| 13 UI suites | 405 | 0 |
| 4 API suites | 148 | 0 |
| `ui_sentry` (DSN build against the mock ingest) | 26 | 0 |
| SQL (clean database) | 435 | 0 |
| Unit and static checks | 148 (country config 77, parity 6, privacy 38, tokens 27) | 0 |
| **Total** | **1,162** | **0** |

**Bugs found and fixed by the regression, all inside this phase's changes:**
- Before verification, the pharmacy row is unreadable. The app first computed the business day
  with default (UTC) settings, so a Kenyan 00:30 sale showed as yesterday. It also overwrote
  the offline profile snapshot with defaults. Now the profile is re-read before the workspace
  opens, the dashboard cache key includes the timezone, and an unreadable pharmacy never
  overwrites the snapshot.
- On a slow connection, a code submitted before the factor loaded was silently ignored. The
  factor is now read from the stored session (no network), and loaded on submit if needed.
- Route telemetry was written before verification and refused by the server (403s). It now
  waits for a verified session.
- Test infrastructure: nine orphaned headless browsers from interrupted runs were holding
  debugging ports, which caused order-dependent failures. The local gate runner now clears them
  between suites.

## Security review (before deployment)

| Check | Result |
|---|---|
| Service-role key in the bundle | **None.** Only the public anon JWT. |
| Sentry auth token in the bundle | **None** (`sntrys_`, `SENTRY_AUTH_TOKEN` absent) |
| TOTP secret logged | **No.** No logging of secrets or codes anywhere. The key lives only in setup component state. Security events never carry secrets (tested). |
| MFA token or flag persisted improperly | **No.** Only Supabase's own session. No MFA or aal keys in `localStorage` (tested). |
| Privilege from user-editable metadata | **No.** `user_metadata` is used only for display (a name) and an onboarding pre-fill. Client-edited claims were tested. |
| New RLS bypass | **No.** The new table has RLS with SELECT only; the private registry has no API grants; every new function is `SECURITY DEFINER` with `search_path = ''`. |
| Tenant isolation | Unchanged and re-proven (SQL, API, UI cross-tenant attacks) |
| Secrets committed | **No.** A scan of all 563 tracked and new files found no real credentials. The only matches are deliberate fake fixtures in the privacy tests: a JWT whose signature decodes to "signature-signature", `sb_secret_abcdefghijklmnop`, and the RFC example TOTP key. The operator logs are gitignored; the test TOTP secrets live only in `/tmp` (chmod 600). |
| Source-map exposure | **None** published. Maps exist only during an authenticated upload build and are deleted afterwards. |
| Local-only observation | The long-lived local database has an empty legacy `public.users` table (no RLS). A clean build renames it (`0002`), and **production has no such table** (REST 404). It is not a production issue. |

## Production

**Deployed on 2026-09-25.** Database → Edge Function → frontend, in the documented order.

| Step | Result |
|---|---|
| Access | CLI signed in to the NevOut account; `qohpyeqyveusnxhnbtxz` (West EU, Ireland) is linked |
| Drift check before applying | `migration list --linked`: `0001`–`0019` applied on both sides, only `0020` pending. **Schema fingerprint of production = fresh local build of `0001`–`0019` in all 7 categories** (columns 262, constraints 104, functions 58, grants 42, policies 51, RLS 23, triggers 7). **No drift.** |
| Pre-migration backup | `nevoutmeds-db-prod-20260925T183705Z.tar.gz.enc`: **OK**, 70,961 bytes, encrypted and verified by decryption, heartbeat recorded |
| Pre-flight | `db push --dry-run`: only `0020_capabilities_mfa.sql`. On production, the migration role can read `auth.mfa_factors`, and the `storage` schema and document policies exist. |
| Migration | `0020` applied; `migration list` shows `0001`–`0020` on both sides |
| Schema after | **Production fingerprint = fresh local build of `0001`–`0020`** (the build all 435 SQL checks run on) in all 7 categories: columns 277, constraints 113, functions 63, grants 44, policies 52, RLS 27, triggers 7. **0 tables without RLS.** Country registry md5 identical. |
| RBAC / MFA configuration | 32 capabilities; role mappings staff 15 / owner 31 / admin 32; `mfa_policy` owner and admin required, staff optional. The 5 new functions are `SECURITY DEFINER` with a pinned `search_path`. 19 policies use capabilities. `security_events` has RLS on and SELECT-only for `authenticated`. 0 API grants on private tables. |
| Unauthenticated probes | Owner RPCs (`financial_summary`, `invite_staff`, `import_inventory_levels`, `reset_member_mfa`, `record_security_event`, `my_security_posture`) → 401 / 404. Tables (`security_events`, `customers`, `documents`, `users_profiles`, `staff_audit_log`) → 42501. `security_events` insert → 401. The private registry is not exposed (PGRST205). |
| Edge Function | `staff-admin` **v3 → v4** (adds `reset_mfa`). Origin secrets verified by digest: `NEVOUT_APP_ORIGIN` = `https://nevout-meds-liberia-pilot.vercel.app`; `NEVOUT_ALLOWED_APP_ORIGINS` = that origin plus `http://localhost:5173`. Probes: no auth header → 401; a non-user token → 401 "invalid session" for `reset_mfa`, `invite`, `suspend` and `set_role`; GET → 405; CORS preflight → 200. |
| Frontend | Vercel deployment **`m42920c1a`**, serving `index-ePvu7uti.js`. It is byte-identical to the locally built and scanned `index-G3tvLUhq.js` (551,253 bytes) except for chunk-hash names, which differ because Vercel embeds the release `nevout-meds@5594dddfb7b5` (the deployed commit). **Rollback target: `k30br88vx`.** |
| Supabase project | The only project reference in any deployed asset is `qohpyeqyveusnxhnbtxz` |
| Production smoke (signed out) | **21/21**: reachability, manifest and icons, `sw.js`, all routes, protected routes → `/login`, service worker activates and precaches, installable, no Demo Mode, correct Supabase project, no unexpected console errors |
| Health check | **HEALTHY**: site, API, `staff-admin`, `ops_health`. Last 24 h: 0 client errors, 0 sync conflicts, 0 sync failures, 0 storage failures. Integrity: all at 0. |
| Bundle security scan | **52 deployed assets** plus the lazy Sentry chunk: only the public anon JWT; no service-role key, `sb_secret_`, Sentry auth token, `otpauth` / TOTP data or private keys; **no source maps** (no `sourceMappingURL`; `.map` URLs return the HTML fallback); no Replay code |
| Sentry | **Disabled.** `VITE_SENTRY_DSN` is not set in Vercel, so the SDK chunk is never loaded, and no `SENTRY_*` build variables means no source maps. Replay is not installed. |
| Data | **Still empty:** 0 pharmacies, 0 profiles, 0 auth users, 0 customers, 0 sales, 0 security events. Only system rows: the capability registry, country rules, migration history and backup heartbeats. **Not seeded.** |
| Post-migration backup | `nevoutmeds-db-prod-20260925T184920Z.tar.gz.enc`: **OK**, 83,339 bytes, heartbeat recorded |

**About the backups.** As with the `0019` deployment, these backup artifacts and their
passphrase live in a temporary session directory. They show that the tooling works against
production; they are **not** the retained operating backup, whose schedule is still a go-live
item.

**MFA in production, how it was verified.** A live sign-in with a second factor cannot be
exercised without creating production accounts, and production must stay unseeded. The proof
rests on three things:
1. production's schema is **identical** to the tested build (fingerprint);
2. that build passed the 81 capability and MFA SQL checks, `api_mfa` 35/35 and `ui_mfa` 43/43;
3. the unauthenticated probes above.

The first real owner's first sign-in will show "Protect your pharmacy" (setup) before the
workspace opens.

### Live production MFA proof: **CLOSED** (run 2026-10-01, verified 2026-10-02 UTC)

The fingerprint-based verification above is now backed by a controlled live test in
production, `ops/security/live-mfa-proof.mjs`. It used one synthetic owner, one synthetic staff
member and one synthetic pharmacy:
- owner email `nevout-mfa-proof-<stamp>@example.com` (RFC 2606, no mailbox);
- staff email `nevout-mfa-proof-staff-<stamp>@example.com`;
- pharmacy name "SYNTHETIC MFA PROOF <stamp> — DELETE".

It went through the real operator tools (`provision-owner.mjs`, `reset-mfa.mjs`), the deployed
`staff-admin` function and the deployed app in Chrome, then removed everything.
- **What it never did:** send email, print or store a password, TOTP key or code, or change
  global Auth settings (MFA and email confirmation unchanged).
- **Who ran it:** the operator, Mo Soumaoro. Creating accounts, signing in with passwords and
  deleting data are operator steps.
- **Before production:** the script was validated on the local stack (44/44 on consecutive
  runs; API-only mode; recovery of an interrupted run).

**Production result: 44/44 checks passed, 0 failed.** Cleanup: auth users 0 → 0, pharmacies 0 → 0;
synthetic users, synthetic pharmacies and tenant rows remaining: 0.

| Required check | Script checks | Production |
|---|---|---|
| 1 Provision a synthetic owner | T1 (operator tool, email confirmed, no password), T1b (password set through the single-use link), T1c (link cannot be reused), T12 (staff provisioned `--for staff`) | Pass |
| 2 No workspace without MFA | T3a (posture: required, not satisfied, 0 capabilities), T3b–T3d (no pharmacy row, no financials, Edge Function 403 at aal1), U1 | Pass |
| 3 QR / setup works | U1 (QR + manual key shown, no workspace), U4b (key gone after setup) | Pass |
| 4 Valid code verifies | U3, U4 (workspace opens only now), T5d (aal2) | Pass |
| 5 Invalid code rejected | U2 (setup), U8 (sign-in), T5c (Supabase Auth 422) | Pass |
| 6 Access only at aal2 | T3b–T3d, T5a, T5b, T5d, T15a | Pass |
| 7 Logout | U5 | Pass |
| 8 Fresh login requires the code | U6, T5a | Pass |
| 9 Reload / refresh doesn't bypass | U7 (reload on the code step), U10 (no client "passed" flag), T5e (refresh keeps aal2 only for a verified session) | Pass |
| 10 Only the synthetic pharmacy visible | U4, T10 | Pass |
| 11 Cross-tenant denied | T11 (PostgREST insert, `record_purchase`, `import_inventory_levels` against a foreign pharmacy id) | Pass |
| 12 Staff / admin capability rules | T11b (owner has 31 capabilities, no platform admin), T12a (staff: MFA optional, 15 capabilities), T12b (owner operations refused), T12c (no self-promotion, cannot reset the owner), T12d (staff opt-in) | Pass |
| 13 Reset works | T13 (owner resets staff MFA through the **deployed `staff-admin` function**), T13b (operator resets the owner's MFA with `reset-mfa.mjs`) | Pass |
| 14 Reset reveals no prior secret | T14a, T14b (no secret, code or otpauth in responses or tool output), T14c (old factor unusable) | Pass |
| 15 Re-enrollment works | T15a (must enroll again), T15b (new key ≠ old key, access restored) | Pass |
| 16 Audit events without secrets | T16a (required-not-enrolled, enrollment, verify, failed challenge, owner reset, operator reset), T16b (no secret, code, URI or password in any event) | Pass |
| Cleanup | C1 (users, pharmacy, profiles, factors, sessions, invitations, tenant and user-keyed rows, storage), C2 (totals back to the pre-run baseline) | Pass |

**Final read-only verification (2026-10-02 UTC, by the assistant, no writes):**

| # | Check | Result |
|---|---|---|
| 1 | Migrations | `migration list --linked`: `0001`–`0020` applied on both sides; `schema_migrations` holds 20 rows, the last being `0020` |
| 2 | Tenant data | 0 auth users, 0 pharmacies, 0 profiles. **All 22 public tables have 0 rows.** 0 storage objects. 0 synthetic users. Only system rows remain: capabilities 32, role capabilities 78, MFA policy 3, country rules 7, backup heartbeats 4, migrations 20. |
| 3 | MFA / session leftovers | `auth.mfa_factors` 0, `mfa_challenges` 0, `sessions` 0, `refresh_tokens` 0, `one_time_tokens` 0, `identities` 0 |
| 4 | RLS | 0 public tables without RLS (22/22 enabled); `rls_disabled_tables` 0 in the manifest |
| 5 | Schema fingerprint | **Identical** to the fresh `0001`–`0020` reference build in all 7 categories, by count **and** md5: columns 277, constraints 113, functions 63, grants 44, policies 52, RLS 27, triggers 7. Country registry md5 is identical. |
| 6 | `staff-admin` | ACTIVE, version 4 (unchanged since 2026-09-25). Preflight 200; an unauthenticated call is refused (401). CORS `*` is unchanged from the deployed code; authorization is by bearer token, with no cookies. |
| 7 | Health check | Site, API, Edge Function and `ops_health` are all OK. Integrity invariants are 0; there are no client errors, sync conflicts or failures. One alert: **database backup age, 152 h.** This is the known deferral of the permanent backup schedule, not a regression. |
| 8 | Signed-out production smoke | **21/21**: routes, guards, service worker, installability, no console errors. The harness now passes `--no-first-run`, because Chrome 154's first-run flow blocked a fresh profile; this is a test-only change. |
| 9 | Project | Linked project is `qohpyeqyveusnxhnbtxz` ("mdonzo1998@gmail.com's Project", West EU). The bundle references only that project. |
| 10 | Bundle secrets | All 46 served assets of `index-ePvu7uti.js` (unchanged) were scanned. The only embedded JWT is the `anon` role. There is no `service_role` string, no `sb_secret_`, Supabase or GitHub tokens, private keys, Sentry auth token or OIDC token, and no otpauth URI. |

**TOTP setting proven.** Enrollment and verification succeeded in production, which is only
possible with **TOTP (App Authenticator) enabled**. The dashboard confirmation item is
therefore satisfied by evidence.

**Not removed, by design:**
- Supabase Auth's own audit log entries for the synthetic emails. This is the platform's
  security trail and is not edited.
- The operator's local, gitignored `provision.log` and `security-ops.log` lines. The operator
  reset is recorded under ticket `LIVE-PROOF-<stamp>`.

To repeat the proof later (for example after an Auth or MFA change), run:

```bash
NEVOUT_SUPABASE_URL=https://qohpyeqyveusnxhnbtxz.supabase.co \
NEVOUT_SERVICE_ROLE_KEY_FILE=<chmod-600 service key file> \
NEVOUT_ANON_KEY_FILE=<chmod-600 anon key file> \
NEVOUT_APP_URL=https://nevout-meds-liberia-pilot.vercel.app \
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node ops/security/live-mfa-proof.mjs --yes
```

**TOTP setting (cannot be read programmatically without the Management API).** Please confirm
it in the dashboard:
- **Where:** Supabase Dashboard → project `qohpyeqyveusnxhnbtxz` → **Authentication →
  Multi-Factor** (`https://supabase.com/dashboard/project/qohpyeqyveusnxhnbtxz/auth/mfa`).
- **What you should see:** **TOTP (App Authenticator)** set to **Enabled**. This is the default
  for hosted projects.
- **Phone MFA** can stay disabled.

## Remaining human actions

| # | Action | Needed for |
|---|---|---|
| 1 | ~~Sign the Supabase CLI in to the NevOut account~~ **Done**; Phase 11 is deployed | — |
| 2 | **Sentry** (optional; the app ships with monitoring off). Create it as described below, then set the Vercel variables and redeploy. | Code-level error monitoring |
| 3 | ~~Confirm TOTP (App Authenticator) is Enabled~~ **Proven** by the live production MFA proof (enrollment and verification succeeded in production) | — |
| 4 | Support contacts: ~~email~~ **Done.** `support@nevoutmeds.com` is live in the app, and the production support-email test was **CLOSED** on 2026-10-02. `demo@nevoutmeds.com` is monitored. WhatsApp is **deferred / TBD**. | Help → support buttons |
| 5 | Independent backup **scheduled and restore-tested** (**deferred**, but mandatory before the first real pharmacy or patient data). Backup owner and incident owner: **Mo Soumaoro** (named). | Hard gate before real data |
| 6 | SMTP (or keep operator provisioning) | Self-service password reset |
| 7 | Brief the first owner: authenticator app on their own phone, with the app's cloud backup on | First sign-in |
| 8 | ~~Run the live production MFA proof~~ **Done: CLOSED** (44/44, cleanup and read-only verification passed) | — |

**Sentry setup information:**

| What | Value to create / copy | Public or secret |
|---|---|---|
| Organization | A Sentry organization for NevOut (for example `nevout-meds`). Pick the **EU** data region if possible, since the pilot data is West-EU. | — |
| Project | Platform **React**, name `nevout-meds-web` | — |
| DSN | Project → Settings → Client Keys (DSN), in the form `https://<key>@o<org-id>.ingest.<region>.sentry.io/<project-id>` | **Public** (only allows sending events) |
| Auth token (only for source-map upload) | Organization → Settings → **Organization Tokens**, scope `project:releases` (source-map upload) | **Secret** |
| Project settings | Data Scrubbing **on**, "Prevent storing of IP addresses" **on**, default scrubbers **on**, retention about 30 days | — |

**Vercel → Project → Settings → Environment Variables (Production):**

| Variable | Value | Public or secret |
|---|---|---|
| `VITE_SENTRY_DSN` | The DSN above | Public (it is embedded in the browser bundle by design) |
| `VITE_SENTRY_ENVIRONMENT` | `production` (optional; this is the default) | Public |
| `SENTRY_AUTH_TOKEN` | The organization token | **Secret**. Build only. **Never** give it a `VITE_` prefix. |
| `SENTRY_ORG` | The organization slug | Not secret |
| `SENTRY_PROJECT` | `nevout-meds-web` | Not secret |

- **Without `VITE_SENTRY_DSN`:** monitoring stays off.
- **Without the three `SENTRY_*` build variables:** no source maps are produced (errors still
  arrive, with minified stacks).
- **Session Replay:** stays **off**; the package isn't even installed.

## Roadmap decisions

| Item | Status |
|---|---|
| E-prescribing | **Not implemented.** A conceptual architecture separates the Liberia/African path from the U.S. path (NCPDP, Surescripts or a certified partner, EPCS, identity proofing). NevOut is **not** Surescripts-ready or certified. |
| Patient portal | **Not implemented.** Patient authorization must be separate from staff RBAC; a patient is never a staff role. |
| Hosting | **Stay on Vercel + Supabase.** A Liquid Web or dedicated-server migration is rejected for now, with explicit triggers for reconsidering. Better Stack was deferred. |

NevOut Meds is **not** described anywhere as HIPAA compliant.
