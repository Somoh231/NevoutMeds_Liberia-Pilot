# NevOut Meds: final pre-pilot security audit report

- **Date:** 2026-10-04
- **Baseline:** `main` @ `fe17a10`. This is what production runs: `https://nevoutmeds.com`, Supabase project `qohpyeqyveusnxhnbtxz`, migrations `0001`–`0021`, `staff-admin` v7.
- **Remediation branch:** `security/final-pilot-audit`. Merged to `main` as `b60423f` and deployed on 2026-10-04.
- **Closeout (2026-10-04):**
  - `0022` applied to production and verified;
  - public sign-up disabled;
  - post-closeout cleanup on `chore/post-security-closeout` (§C2).
- **Current verdict:** **A — GO FOR SECURITY.** It does **not** authorise real pharmacy, customer or patient data.
- **Findings register:** [SECURITY_FINDINGS_REGISTER.md](SECURITY_FINDINGS_REGISTER.md)
- **Verdict:** [PILOT_SECURITY_GO_NO_GO.md](PILOT_SECURITY_GO_NO_GO.md)

## How the audit was run

Phase 1 was read-only reconnaissance plus adversarial testing.

- **Production** was touched only non-destructively:
  - HTTP header and redirect probes
  - CORS preflights
  - the public `/auth/v1/settings` endpoint
  - production bundle download and scan
  - read-only `supabase migration list`, `functions list`, `functions download` and `secrets list` (names only)
  - a signed-out browser smoke test
- **No production data, schema, auth configuration, secret, Vercel setting or DNS record was changed.**
- **No tenant was created in production.** The synthetic demo owner and pharmacy were not touched.
- **All adversarial tenant, authorization and concurrency testing** ran on disposable local databases built from the same 21 migrations. Each was dropped afterwards (`nevout_verify`, count 0 confirmed). Each probe user was deleted.
- **No secret, token, TOTP seed, signed URL or password appears in this report.**

---

## A. Executive summary

> **Closeout, 2026-10-04: A — GO FOR SECURITY.** The audit verdict below was B — CONDITIONAL GO. Its single P1 condition, SA-01, is now closed in production: `0022` was applied and verified. The branch is deployed with security headers and the NV-OFF-02 and NV-AUTH-02 fixes, and public sign-up is off. No P0 or P1 is open.
>
> This verdict is **for security only**. It does **not** authorise real pharmacy, customer or patient data. That still waits on these pre-real-data gates:
> - a permanent backup **with a successful restore test**, which also covers NV-LEAD-01a/b;
> - NV-OPS-02;
> - Sentry;
> - Tanzania privacy and regulatory readiness.
>
> The text that follows is the audit as originally written.

**Audit verdict: B — CONDITIONAL GO.** I found no exploitable P0, no cross-tenant read or write, and no privilege escalation. The multi-tenant core holds up under adversarial testing:
- RLS
- capability model
- MFA gate
- composite tenant keys
- server-side idempotency
- staff lifecycle

**One P1 must be closed before real pilot data.**

- **SA-01:** any team member can rewrite a customer's `credit_balance`, `total_spend`, visit count or last visit directly through the REST API, with no audit trail. Credit is a core feature and has no repayment ledger, so an insider could silently write off debt.
- **Fix:** migration `0022_final_security_audit.sql`. It is written, validated on a fresh database (481/481 SQL checks), and its regression tests fail without it.
- **It is a production migration, so it was not applied.** It needs your authorisation.

**What must be done before launch (real data):**
1. Authorise and apply `0022`, which closes SA-01 and the three items bundled with it: SA-02, SA-03 and SA-04.
2. The existing **hard gate**: run the independent encrypted backup and a restore test against production.
3. Deploy the remediation branch's frontend. This needs your authorisation; it carries the security headers and the device-data clean-up.
4. Decide on owner self-signup. Recommendation: switch it off for the pilot (NV-AUTH-01).
5. Privacy notice and terms (NV-PRIV-01/02). These need legal review; no text was invented.

**What may safely be deferred:** every remaining P2/P3 item in the register (§B). The pre-agreed deferrals also stay deferred: Sentry until immediately before activation, SMTP, the WhatsApp API and Supabase Pro.

---

## B. Prioritised findings table

| Priority | Finding | Evidence / file path | Affected area | Rule / standard | Severity | Proposed fix | Fix type | Status |
|---|---|---|---|---|---|---|---|---|
| P1 | SA-01: staff can rewrite customer money fields | `public.customers` default grants; probe `UPDATE … credit_balance=0` succeeded as staff | Customers / credit | OWASP A01 (Broken Access Control), mass assignment | High | `0022` §SA-01 column privileges | Migration | **Fixed (production, `0022`)** |
| P2 | SA-02: idempotent replay answers before authorising | `0017:44-64` | Offline sync RPCs | OWASP A01 | Medium | `0022` §SA-02 | Migration | **Fixed (production)** |
| P2 | SA-03: invitations outlive the inviter's authority | probe `09_invite_after_suspend` | Staff lifecycle | Access revocation | Medium | `0022` §SA-03 trigger | Migration | **Fixed (production)** |
| P2 | NV-OFF-01: sign-out left cached pharmacy data in IndexedDB | `AuthProvider.tsx:344`; `db.ts:97` unused | Offline / shared device | Data minimisation | Medium | Clear cache and meta when there is no session | Code | **Fixed (deployed)** |
| P2 | NV-EXP-01: CSV formula injection | `charts.jsx:55`, `exports.ts:29` | Reports / documents export | OWASP CSV Injection | Medium | `utils/csv.ts` encoder | Code | **Fixed (deployed)** |
| P2 | NV-IMP-01: an update import resets absent fields | `rows.ts:99-106,136-139` | Import | Data integrity | Medium | Send only the columns the file contains | Code | **Fixed (deployed)** |
| P2 | NV-IMP-02: case-variant duplicate products | `0007:12`, `0020:803` | Import / inventory | Data integrity | Medium | `0023`: `lower(name)` unique index, whitespace normalisation, collision guard (production has 0 products) | Migration | **Fix ready (`0023`), awaiting authorisation** |
| P2 | NV-HDR-01: no CSP, anti-framing or nosniff headers | prod `curl -D -` | Edge / Vercel | OWASP Secure Headers | Medium | `vercel.json` headers | Config (deploy) | **Fixed (deployed)** |
| P2 | NV-AUTH-01: public owner signup enabled | prod `/auth/v1/settings` | Auth | Least privilege / abuse | Medium | Disable signup for the pilot; remove the sign-up screens | Auth config + code | **Fixed (production)**; UI clean-up on `chore/post-security-closeout` |
| P2 | NV-DOC-01: placeholder "download" under the real file name | `exports.ts:15`, `DocumentsScreen.jsx:121` | Documents | Deceptive UX | Medium | Honest details export | Code | **Fixed (deployed)** |
| P2 | NV-COPY-01: "recorded sales rate" for a hand-entered value | `insights.ts`, `ExpiryScreen.jsx` | Analyst / expiry | Unsupported claims | Medium | Reword ("entered") | Code (copy) | **Fixed (deployed)** |
| P2 | NV-PRIV-01: no privacy notice or terms | `App.tsx` routes | Legal surface | Local data-protection laws (review) | Medium | Lawyer-drafted pages | Legal | Owner action |
| P2 | NV-PRIV-02: health-inferable customer data with no notice, consent or deletion | `0003:5-15`; no customer delete | Privacy | Same | Medium | Notice, consent capture, owner delete, retention | Legal + product | Owner action |
| P2 | NV-OFF-02: offline sign-out left the session and cache on the device | auth-js `_signOut` | Offline / shared device | Session management | Medium | Local session removal when server sign-out fails | Code | **Fixed (deployed)** |
| P2 | NV-AUTH-02: `#access_token` link could swap the signed-in session | `detectSessionInUrl` | Auth | Login CSRF | Medium | URL sessions only on email-link routes, never over a stored session | Code | **Fixed (deployed)** |
| P2 | NV-LEAD-01a: a restore drops MFA factors, so a password alone reaches aal2 | `backup-db.sh` auth dump; local probe | Backup / MFA | Authentication assurance | Medium | Restore factors or supervised re-enrolment; post-restore check | Ops (backup phase) | Open: backup gate |
| P2 | NV-LEAD-02: owner API DELETE cascades away sales and stock history with no audit | composite FK cascades; local probe | Ledgers | Integrity / non-repudiation | Medium | Revoke DELETE on `customers`/`products`, or RESTRICT plus soft delete; audit deletions | Migration | Open: recommended before real data |
| P2 | NV-OPS-02: DB password on backup-script command lines | `ops/backup/lib.sh:80-84` | Backup host | Secret handling | Medium | `PGPASSFILE` / env | Ops (backup phase) | Open: backup gate |
| — | NV-LEAD-01b: a restore rolls back post-snapshot revocations | artifact contents | Backup / access | Operational | — | Runbook step plus a restore-test check | Ops | Deferred operational risk |
| P3 | SA-04: TRUNCATE/TRIGGER/REFERENCES granted to `authenticated` | probe `05_truncate` | DB grants | Least privilege | Low | `0022` §SA-04 | Migration | **Fixed (production)** |
| P3 | SA-05..SA-10, NV-MFA-01, NV-CORS-01, NV-DEMO-01, NV-IMP-03..05, NV-DOC-02/03, NV-COPY-02, NV-DEP-01 | see register | Various | Defense in depth | Low | see register | Various | Open / owner action |
| P3 | NV-OPS-01: operator logs lacked the target project | `ops/provision/provision.log` | Operator audit | Auditability | Low | `target` host field | Code (ops) | **Fixed (deployed)** |
| P3 | NV-TEL-01: customer name in conflict telemetry | `SyncProvider.tsx:118` | Telemetry | Data minimisation | Low | Drop the summary | Code | **Fixed (deployed)** |

---

## Project-specific areas (A–J)

### A. Offline-first and local-device security

| # | Requirement | Result |
|---|---|---|
| 1 | Pharmacy A data never appears after signing in to Pharmacy B | **Pass.** Everything is partitioned by `pharmacy_id:user_id`; the in-memory query cache is cleared on tenant change (`SyncProvider.tsx`). The strengthened e2e check now asserts that B's cache holds nothing from A. |
| 2 | Logout clears what should no longer be available | **Was failing (NV-OFF-01). Fixed on the branch.** Cached reads and the profile snapshot are removed on any session end. **Queued unsynced work is kept on purpose**: it is the only copy of sales, it stays partitioned, it is replayed only for the same person, and the server re-authorises it. The sign-out dialog already warns about pending work. |
| 3 | Suspension prevents queued offline work from replaying | **Pass.** Every RPC checks active status. Suite 40 shows the suspended user's queued sale rejected with no receipt left. SA-02 also closes the replay-of-a-stored-result path. |
| 4 | Role/capability changes invalidate queued actions | **Pass.** Authorisation is evaluated at replay time (`private.has_capability`/`current_profile` per request), never at queue time. |
| 5 | MFA reset cannot resurrect stale privileged state | **Pass.** The queue replays only when `security.satisfied`. After a reset the next refresh is aal1 (verified locally on GoTrue v2.197.0). Residual: the current access token stays valid ≤ 1 h (NV-MFA-01). |
| 6 | A queued action cannot run against another tenant | **Pass.** `p_pharmacy_id` in the payload is checked against `private.pharmacy_id()` server-side. Probed: cross-tenant writes refused; replay leakage was SA-02 (fixed in `0022`). |
| 7 | Crash-during-sync cannot duplicate effects | **Pass.** Entries stranded in "syncing" are resent with the same idempotency key. The receipt is written in the same transaction as the effects. A concurrent same-key call blocks, then returns the first result (probe 06; suite 40). |
| 8 | Replay cannot bypass idempotency | **Pass.** Key-type confusion is also now refused (SA-02). |
| 9 | Service-worker caches don't expose authenticated data | **Pass.** Runtime caching is destination-based (navigation, script, style, worker, image). API fetches are never cached. |
| 10 | Shared-device behaviour | **Pass after NV-OFF-01.** The device ID in `localStorage` is a random UUID with no personal data. |
| 11 | Offline drafts have tenant ownership | **Pass.** `tenant_key`, `pharmacy_id`, `user_id` and `device_id` are on every queued entry. |
| 12 | Reconnect cannot silently overwrite newer server state | **Mostly pass.** Products use version checks (PT409), but `update_product_checked` can lose an update under a true race (SA-07, P3). Stock uses deltas, not absolute values. |
| 13 | Cache minimised | **Partial.** Customer snapshots use `select *`, including conditions and allergies, because the till shows allergy warnings offline. That is defensible, and sign-out now clears it. Consider trimming notes and DOB from the offline snapshot (P3). |

### B. Multi-tenant and multi-country isolation

Verified by probe and by suites 10, 50 and 70:
- `pharmacy_id` enforcement
- composite FKs
- RLS on all 22 tables
- RPC tenant derivation
- storage prefix
- realtime filters plus RLS
- import tenant binding
- admin read-only cross-tenant visibility

Residual: realtime DELETE primary keys can reach other tenants (SA-10, Supabase platform behaviour).

On country handling:
- Currency is locked once sales exist. Reports never sum across currencies. Business dates are computed in the pharmacy's own timezone (`customers_local_dates` trigger, `datetime.ts`).
- Phones are normalised to E.164 per country, and the unique key is `(pharmacy_id, phone)`. A collision is possible only inside one pharmacy, so there is no cross-tenant collision.
- **Tanzania:** the TZ/TZS/+255/Africa/Dar_es_Salaam configuration exists, but the UI marks its rules "not yet verified" and calculates no tax. **Configuration availability is not regulatory readiness.**

### C. Authorisation, MFA and operator controls

All of these were verified:
- **Escalation:** staff cannot get owner capabilities, owners cannot get or invite `admin`, and clients cannot assign their own role (column grant plus the `guard_profile_mutation` trigger).
- **Server-side enforcement:** hidden UI is not relied on.
- **MFA:** aal1 privileged sessions reach nothing. AAL2 cannot be forged through local storage (the database reads the signed claim). A reset never reveals the TOTP secret, and old factors are deleted.
- **Staff-admin:** every action calls the RPC as the caller first.
- **Suspended users:** they are banned in Auth, so refresh fails, and the database status gate refuses them.

Gaps:
- **Invitations:** these are SHA-256-hashed, single use, and expire in 7 days by default. SA-03 was the gap (fixed in `0022`).
- **Redirects:** the app builds them from its own origin, and `safeInternalPath` blocks `//` and `/\`.
- **Service-role scripts:** they read the key from a `chmod 600` file and never from argv. The browser bundle has no service key.
- **Operator provisioning:**
  - **Links:** the operator never sees a password. The setup link is single-use and expires with the OTP lifetime (1 h by default).
  - **Audit:** the log was missing the target environment (NV-OPS-01, fixed).
  - **Wrong email:** a link issued to a mistyped address still reaches the verified person over WhatsApp, but later resets would go to the typo. Add a read-back confirmation step to the runbook (P3).
  - **Terminal exposure:** the setup link is printed to the operator's terminal by design. Close that terminal or clear its scrollback after sending.

### D. Production demo account

- The demo owner is `demo@nevoutmeds.com`, created on 2026-10-04 by operator provisioning.
- **The login identifier is public**, because the same address is the website's demo-request contact.
- **It is an owner**, so TOTP is mandatory. Credential stuffing therefore needs the password **and** a live TOTP code. Supabase applies its own auth rate limits; their production values were not visible to this audit.
- **Password reset** mail goes to a NevOut-controlled mailbox, and with SMTP deferred it is not delivered anyway.
- **Isolation:** the demo tenant is isolated like any other tenant.
- **Metrics:** admin and pilot metrics have no demo exclusion, so the demo tenant likely contaminates pilot metrics.

**Recommendation (P3, owner action, not done):**
- give the demo owner a non-public login alias;
- add an `is_demo` flag, or exclude its pharmacy id in `0010`/`0019` metrics.

### E. Edge Function and CORS

Verified from deployed behaviour (see register INFO):
- the three intended origins are allowed;
- unknown, look-alike and `null` origins get 403 from the function;
- the unauthenticated 401 with `*` comes from the Supabase gateway, not the function.

JWT verification stays on. **Recommendation:** at pilot activation, remove `http://localhost:5173` and the legacy `vercel.app` origin from `NEVOUT_ALLOWED_APP_ORIGINS`, and retire the alias once nothing points to it. That is an owner action (secret change).

### F. Sensitive pharmacy and customer data

The product does not intend to hold clinical records, but customer identity together with these fields is **health information by inference**:
- `conditions`
- `allergies`
- DOB and gender
- free-text notes
- medicine-level purchase history
- refill reminders naming the medicine

All staff can read it, and the platform admin can read every tenant's copy. There is no privacy notice, no consent capture and no customer deletion (NV-PRIV-01/02).

The reminder WhatsApp text names the medicine (NV-COPY-02). **HIPAA was not assumed, and it is not claimed anywhere.** Applicability of the pilot countries' data-protection laws needs qualified legal review (§legal).

### G. File and import security

**Verified correct:**
- **SheetJS:** 0.20.3, from the official CDN tarball with an integrity hash; not affected by CVE-2023-30533 or CVE-2024-22363.
- **Import limits:** 5 MB before reading, 5000 rows (also enforced server-side), 64 columns.
- **Parser safety:** `__proto__` keys are blocked and `cellFormula:false` means formulas are not evaluated.
- **Execution:** parsing runs in a Worker with a 15 s kill.
- **Tenant binding:** server-side, with the owner-only `inventory.import` capability.
- **Replays:** idempotent.
- **Documents bucket:** private, 25 MB, MIME allow-list with no SVG or HTML, owner-only, server-enforced prefix, 60 s signed URLs that are never logged.

**Fixed:** CSV export injection (NV-EXP-01) and destructive re-imports (NV-IMP-01).

**Open:**
- case-variant duplicate products (NV-IMP-02)
- content sniffing for XLSX (NV-IMP-03)
- parser memory (NV-IMP-04)
- silent row cap (NV-IMP-05)
- document key and filename handling, download navigation, orphaned objects (NV-DOC-02/03)

### H. The Analyst is deterministic, so AI controls do not apply

`insights.ts` is plain arithmetic over the pharmacy's own records. There is no LLM, AI provider, model or prompt anywhere in `client/src`, so **generic LLM and prompt-injection controls are NOT APPLICABLE.** Residual wording: "intelligent purchasing tools" in the meta description and the sparkle icon (P3), and "recorded sales rate", which is now fixed.

### I. Deferred items

These deferrals are accurately documented in `PILOT_GO_LIVE_CHECKLIST.md`:
- **Backup and restore:** a **KNOWN PRE-PILOT HARD GATE**, not a regression. Real data is explicitly prohibited until it is done.
- **Sentry:** a pre-activation task; it is not configured, and nothing claims it is.
- **SMTP, WhatsApp API, Supabase Pro:** deferred.

The product claims none of these capabilities: WhatsApp is always "opens WhatsApp, delivery unknown", and Help shows email support only when configured.

### J. Production claims and pharmacy safety

- **Verified:** no fake metrics, testimonials or "trusted by" claims; mock-ups are labelled "Sample data"; supplier savings are computed from recorded prices; WhatsApp is never shown as sent; Tanzania is marked unverified; no compliance or certification claims.
- **Fixed:** NV-COPY-01 and NV-DOC-01.
- **Open:** minor copy items, NV-COPY-02. These include the tagline "Your pharmacy, never out of stock" and "prevent stockouts", which are outcome promises; consider softer wording.

---

## Generic prompt sections, project-specific dispositions

- **Stack:**
  - Vite/React SPA on Vercel
  - Supabase: Postgres, Auth (email + TOTP), Storage, Realtime, one Edge Function
  - no server-side app code, payments, queues or cron in production
  - operator scripts on a laptop
  - Sentry is optional and off
- **Sessions:** stateless Supabase JWTs (1 h by default) with refresh-token rotation. Sessions survive deploys because nothing is held in server memory, so there is no sticky-session dependency.
- **CSRF:** not applicable. Bearer tokens are sent from JS and no cookies are used for auth.
- **SQL injection:** none. The client uses PostgREST and RPCs; `format(%L)` appears only in tests.
- **SSRF, command injection, deserialisation:** no server code that fetches or executes user input.
- **WAF and edge:** Vercel's platform edge, including its default DDoS mitigation, plus Supabase's gateway and auth rate limits. **No custom WAF or firewall rules were found in the repo, and dashboard settings could not be inspected:** the Vercel MCP needs authorisation, and Supabase auth rate-limit values aren't exposed publicly. ModSecurity, CRS and Fail2ban are **not applicable** (managed serverless). This is an owner action: review Vercel Firewall and Supabase Auth rate limits in their dashboards.
- **Logging:**
  - Supabase Auth audit log
  - `staff_audit_log`
  - `security_events`, append-only for clients
  - `app_logs` and `app_events`
  - operator logs
  - backup heartbeat
  - Sentry off
  - the health check exists but alert delivery is still open (checklist #9)
- **Backup and resilience:** see deferred gate I. "Backups enabled" is not claimed, and restore against production is untested.
- **Load and concurrency:** probed locally (same-key, oversell, last-owner and version races). No production load testing, by policy.
- **Error boundaries, loading states, forms and accessibility:** covered by earlier phases' suites (axe in `ui_core_flows`, `ui_mfa` and others) and re-run here (§D). No new defects were found in this pass beyond those in the register.
- **Billing, COPPA, email marketing, SMS, DMCA, FCRA, political:** **not applicable.**
  - No checkout, subscription or payment code; the pricing tiers are informational and the demo request only opens the visitor's mail app.
  - B2B staff tool, not directed at children.
  - Only Supabase transactional auth email, and SMTP is deferred.
  - No SMS.
  - No public user-generated content; documents are private.
- **Fonts and external resources:** none. No Google Fonts, CDN scripts or trackers in the production bundle.
- **Compliance readiness (not certification):** controls already map to SOC 2 and ISO 27001 themes:
  - access control: RLS, capabilities, MFA
  - change management: migrations, tagged releases, tests
  - incident ownership: named
  - vendor list: Supabase, Vercel, Sentry when enabled
  - backups: tooling built, gate open

  Gaps: no formal risk register, vendor DPAs, security training records or evidence collection cadence. **No SOC 2, ISO or HIPAA status is claimed.**

### Legal and privacy: what is verified, what is interpretation, what needs a lawyer

- **Technically verified facts:**
  - Hosting is Supabase (West EU, Ireland) and Vercel (global edge). Customer data therefore leaves the pilot country, so this is a cross-border transfer.
  - The data collected is as listed in §F.
  - There is no privacy notice, consent capture or customer deletion path.
- **Reasonable interpretation:** customer identity plus conditions, allergies or medicine purchases is health-related personal data in most data-protection regimes.
- **Requires qualified legal review:**
  - Which laws apply in each launch country: Liberia; Ghana (Data Protection Act, 2012); Nigeria (Nigeria Data Protection Act, 2023); Kenya (Data Protection Act, 2019); Tanzania (Personal Data Protection Act, 2022); and others in the registry.
  - NevOut's role as processor or controller toward pharmacies.
  - Any registration requirements.
  - Whether the EU hosting region triggers transfer rules.
  - The privacy notice and terms text.

  None of this is asserted as settled here.

---

## C. Changes implemented (branch `security/final-pilot-audit`)

| File | Change | Reason | Test |
|---|---|---|---|
| `client/src/platform/offline/session.ts`, `offline/db.ts`, `auth/AuthProvider.tsx` | `forgetSignedOutDeviceData()` clears the IndexedDB `cache` and `meta` stores on every session end and on a signed-out start-up. The queue is kept. | NV-OFF-01 | `ui_offline_first.e2e.mjs`: 2 new or strengthened checks |
| `client/src/platform/offline/SyncProvider.tsx` | The queue summary (customer name and amount) is dropped from `sync_conflict_dismissed` telemetry | NV-TEL-01 | Code review; telemetry type and reason only |
| `client/src/platform/utils/csv.ts` (new), `features/reports/charts.jsx`, `features/documents/exports.ts` | Shared CSV encoder: quoting, quote doubling, formula neutralisation | NV-EXP-01 | `export_import_safety.test.mjs` |
| `client/src/platform/import/rows.ts` | Optional columns are sent only when present in the file | NV-IMP-01 | same |
| `client/src/platform/features/documents/{exports.ts,DocumentsScreen.jsx}` | Honest "details only" export: file name, text and toasts | NV-DOC-01 | same |
| `client/src/platform/features/{analytics/insights.ts,expiry/ExpiryScreen.jsx,inventory/InventoryScreen.jsx,inventory/model.ts}` | "recorded sales rate" → "entered sales rate" | NV-COPY-01 | Build and typecheck |
| `vercel.json` | CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | NV-HDR-01 | Real-Chrome UI suites against a local build served with these headers, plus CSP violation reporting |
| `supabase/migrations/0022_final_security_audit.sql` (new, **not applied to production**) | SA-01 column privileges; SA-02 authorise before replay and type check; SA-03 invitation revocation trigger; SA-04 grant hygiene | P1/P2/P3 DB findings | `supabase/tests/80_final_security_audit.test.sql`: 30 assertions; 14 fail on baseline |
| `ops/provision/provision-owner.mjs`, `ops/security/reset-mfa.mjs` | Audit entries record the `target` project host | NV-OPS-01 | `node --check`; logic unchanged |
| `supabase/tests/export_import_safety.test.mjs` (new) | 18 regression checks; 13 fail on `main` | — | — |
| `supabase/tests/lib/harness.mjs`, 7 browser suites, `ux_audit.mjs` | Test harness only: `--no-first-run --no-default-browser-check`, and wait for a page target. Current Chrome opens a first-run surface with no page target, so every UI suite crashed at start-up. | Test infrastructure | The suites run again |
| `SECURITY_FINDINGS_REGISTER.md`, `FINAL_SECURITY_AUDIT_REPORT.md`, `PILOT_SECURITY_GO_NO_GO.md` | Audit deliverables | — | — |

**Migrations changed:** `0022_final_security_audit.sql` was added. It is **not** applied to production. It was applied to the local dev database only, to run the UI suites. **No existing migration was edited.**

**Deployed configuration changed:** **none.**

### C2. Post-closeout cleanup (branch `chore/post-security-closeout`)

| Commit | Change | Reason | Test |
|---|---|---|---|
| UX cleanup | `LoginPage.tsx` and `AcceptInvitePage.tsx` are now sign-in only. The new `NoAccountHelp.tsx` reads: "Need a NevOut Meds account? Contact your organization administrator / pharmacy owner or NevOut Meds support", linking the configured `VITE_SUPPORT_EMAIL`. `AuthProvider` no longer has sign-up methods. Operator, onboarding and architecture docs are updated. Recovery, invitation, onboarding, MFA and setup links are unchanged. | NV-AUTH-01 follow-up: with sign-up disabled, those screens could only fail | `public_signup_disabled.test.mjs` (6; 4 fail on the pre-change code); `ui_foundation`, `ui_phase8_correctness`, `ui_owner_provisioning`, `ui_staff_lifecycle`, `ui_recovery`, `ui_session_security`, `ui_mfa` |
| NV-IMP-02 | Migration `0023_product_name_case_insensitive.sql` (**proposed, not applied to production**), and the import row builder now normalises spacing | NV-IMP-02 | `81_product_name_uniqueness.test.sql` (24; 14 fail without `0023`); `ui_import` (+4; 3 fail without it); `export_import_safety` (+3); upgrade path on a `0001`–`0022` database holding collisions |
| Lead validation | `supabase/tests/probes/lead01_restore_mfa.probe.mjs` and `lead02_owner_delete_cascade.probe.mjs`: local-only, and they refuse a non-local API | NV-LEAD-01/02 | Both reproduced twice |
| Docs | This report, the register, and the go/no-go | Closeout | — |
| Tooling | `.gitignore` excludes `.claude/skills/`. `skills-lock.json` is left untracked, pending the owner's decision. | No third-party skill source in the product repository | `git check-ignore` |

**Migrations changed:** `0023` was added. It is **not applied to production**, by rule; it needs owner authorisation. It was applied only to the local development stack, to run the UI and API suites. **No existing migration was edited.**

**Deployed configuration changed in the cleanup:** none.

---

## D. Test and validation results

The final, complete list with pass/fail counts, commands and skipped items is in `PILOT_SECURITY_GO_NO_GO.md` → "Tests executed" and "Production checks executed". In summary:

- **SQL:** 481/481 on a fresh database with `0022`. Without it, 14 of the new checks fail.
- **Node:** 190/190, including the new 18. On `main`, 13 of the new checks fail.
- **Real-Chrome UI suites against a local build served with the production CSP and headers:** 301/301 across 8 suites, plus the PWA route check, with zero CSP violations from the app.
- **API suites:** 148/148 locally.
- **Production:** the CORS suite passed 24/24 signed out. Every other production check was read-only.

**Post-closeout cleanup (`chore/post-security-closeout`):**
- **SQL:** 505/505 on a fresh database through `0023`, and the upgrade path is validated.
- **Node:** 230/230.
- **API:** 148/148.
- **UI:** clean passes for the auth, recovery, invitation, provisioning, MFA, session and import suites.
- **CSP:** 0 violations.
- `ui_offline_first`, `ui_offline_sale_stock` and `ui_core_flows` were blocked by the environment (a loaded local Docker host). The deployed `main`, run in the same environment, failed them the same way.

Full table: `PILOT_SECURITY_GO_NO_GO.md` → "Post-closeout cleanup".

**Skipped:**
- Semgrep and CodeQL (not installed).
- The Cloudflare `security-audit` skill (not installed at `.claude/skills/security-audit/`).
- Production load testing (prohibited).
- Backup restore (deferred gate).

---

## E. Remaining risks

| Kind | Risks |
|---|---|
| Technical | SA-01..04 are closed in production (`0022`). Remaining:<br>• NV-IMP-02 stays live until `0023` is authorised and applied;<br>• NV-LEAD-02 (owner API delete erases ledgers, no audit);<br>• SA-05..SA-09 (within-tenant integrity and DB hygiene);<br>• parser memory on low-end devices;<br>• the cross-origin download behaviour. |
| Privacy | Health-inferable customer data with no notice, consent or deletion; admin cross-tenant read access; medicine names in WhatsApp reminder text; cross-border hosting (EU). |
| Legal | No privacy policy or terms. Country data-protection applicability and registration are unreviewed. NevOut's processor/controller role toward pharmacies is undefined. |
| Compliance | No DPAs with Supabase or Vercel on file (owner to confirm); no formal risk register or training evidence; no SOC 2/ISO/HIPAA claim (correctly). |
| Operational | **The backup and restore hard gate is open**, and with it NV-OPS-02 and NV-LEAD-01a/b: a restore currently drops MFA factors and rolls back revocations. Alert delivery is not configured and Sentry is off. There is a single named incident owner, with no phone number recorded. |
| Infrastructure | Vercel Firewall and Supabase auth rate limits unverified. Production CORS still allows localhost and the legacy origin. Public sign-up is disabled (since 2026-10-04). Auth minimum password length is 6 on the server (the app enforces 8), and sessions have no time limit. CLI v2.98.2 (v2.119 available). |

## F. Owner-action checklist

1. ~~Authorise and apply migration `0022`~~: **done 2026-10-04**, verified.
2. ~~Merge and deploy the branch frontend~~: **done**. `b60423f` is deployed and the headers are verified live.
3. **Backup hard gate:** schedule the encrypted backup and complete one restore test from a scheduled artefact (checklist #1). In the same phase:
   - fix NV-OPS-02;
   - make the restore restore MFA factors, or force supervised re-enrolment (NV-LEAD-01a);
   - reapply revocations made after the snapshot (NV-LEAD-01b).
4. ~~Decide on self-signup~~: **disabled 2026-10-04**. The sign-up screens are removed in `chore/post-security-closeout`.
4a. **Authorise migration `0023`** (NV-IMP-02) once the cleanup branch is merged. Production has 0 products, so nothing conflicts. Re-run `supabase migration list --linked` afterwards.
4b. **Decide the NV-LEAD-02 remediation** (revoke API DELETE on `customers`/`products`, or RESTRICT plus soft delete, with audit). Recommended before real data.
5. **Privacy notice, terms and customer-data notice:** commission legal review per launch country. Decide on consent capture and customer deletion, and on platform-admin access to health fields.
6. **At activation:**
   - trim `NEVOUT_ALLOWED_APP_ORIGINS` to `https://nevoutmeds.com`;
   - retire the `vercel.app` alias when unused;
   - set the Sentry DSN;
   - configure alert delivery.
7. **Demo account:** consider a non-public login alias, and exclude the demo tenant from pilot metrics.
8. **Review Vercel Firewall settings and Supabase Auth rate limits** in their dashboards. The Vercel MCP in this session needs authorisation (`/mcp`) before it can be inspected.
9. **Vendor DPAs** (Supabase, Vercel, and Sentry when enabled), insurance, and incident contact numbers.
10. **MFA runbook:** for a lost or stolen device, combine the MFA reset with session revocation (suspend, then reactivate), because the current token lives up to 1 h (NV-MFA-01).
11. **Supabase CLI:** update it (v2.98.2 → latest).

## G. Deferred items

| Item | Why deferred | What makes it mandatory | Blocks real data? |
|---|---|---|---|
| Permanent independent backup **and a successful restore test**, including NV-LEAD-01a/b | Cost and decision timing | **First real pharmacy, customer or patient data** | **Yes (hard gate)** |
| NV-OPS-02: backup DB password on the command line | Fixed with the backup phase | Backup schedule going live | **Yes** |
| Sentry | Activated just before real data | Real data | **Yes** |
| Tanzania privacy and regulatory readiness (PDPA 2022 applicability, notice, consent, cross-border hosting) | Legal review | Real data in Tanzania | **Yes, for Tanzania** |
| SMTP | Operator provisioning suffices | Self-service password reset or open signup | No |
| WhatsApp API / support number | Product scope | Any automated messaging | No |
| Supabase Pro / PITR | Cost | Paying customers or operational need | No |
| `react-router` 7 / Vite 8 upgrades | Upgrade risk is greater than advisory risk (documented) | Post-pilot maintenance window | No |
