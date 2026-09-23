# Final pilot readiness report: controlled Liberia pilot

Date: 2026-09-23 · Scope: **one small, controlled Liberia pilot**. This is not a public launch, a
seven-country rollout or an enterprise deployment.

| | |
|---|---|
| Production frontend | `https://nevout-meds-liberia-pilot.vercel.app`, serving `index-DTf7Yg3O.js` (commit `537c05b`) |
| Production backend | Supabase `qohpyeqyveusnxhnbtxz` (West EU), migrations `0001`–`0018` |
| Branch / tags | `phase8/ux-design-system`; `pre-phase8-hardened`, `post-phase9-multicountry` |
| Data used for every test | synthetic only (`@e2e.local` users, E2E / Pilot pharmacies); **removed from production after testing** |

## Verdict: **CONDITIONAL GO — CONTROLLED LIBERIA PILOT**

**The software is ready.** No open defect remains involving:
- tenant leakage or privilege escalation;
- transaction duplication or inventory corruption;
- auth bypass;
- an inaccessible deployment.

Two real defects found during this final pass were fixed, deployed and re-verified on production:
- a sign-in race that could send an owner to onboarding;
- offline sales stranded in "syncing" after a crash.

**The production environment is not ready for real data yet.** Four conditions must all be met
**before the first real pharmacy is onboarded**. Until then the status is **NO-GO for real data**:

| # | Condition | Why it's a condition | How it's verified |
|---|---|---|---|
| **C1** | **SMTP / account creation:** configure production SMTP, **or** turn off "Confirm email" for the pilot | Today a new owner or an invited staff member **cannot create an account** (the signup returned 429 `over_email_send_rate_limit`) | A signup and a WhatsApp-link invite acceptance succeed on production |
| **C2** | **Backup / restore posture:** Pro plan with daily backups, and/or a scheduled encrypted logical dump | `supabase backups list`: **no backups, PITR off**. RPO today is **unbounded**. | A backup is listed or a dump is verified; the full-environment restore is scheduled |
| **C3** | **Incident owner** named in the runbook | No one is accountable for an outage | A name in `docs/PILOT_INCIDENT_RUNBOOK.md` |
| **C4** | **Backup owner** named in the runbook | No one is accountable for backups and restores | A name in `docs/PILOT_INCIDENT_RUNBOOK.md` |

**Synthetic production cleanup: COMPLETE (2026-09-23).** All synthetic accounts, pharmacies and
tenant data were removed from production (details below). Production now holds **no tenant data
at all**: 0 pharmacies, 0 users.

Human actions are listed in [PILOT_GO_LIVE_CHECKLIST.md](PILOT_GO_LIVE_CHECKLIST.md).

**Operational note:** Supabase CLI access was restored for the cleanup and is working. Keep the
CLI signed in with the NevOut account.

**Not conditions for this pilot, but known:**
- Password reset stays unavailable until SMTP is configured (if C1 is met via option b).
- Monitoring is manual.
- Regulatory research is open (see §18).

---

## 1–20. Readiness by area

Classifications: PASS / PASS WITH BLOCKERS / FAIL / NOT VERIFIED.

| # | Area | Status | Evidence |
|---|---|---|---|
| 1 | Deployment | **PASS** | Production deploy of `537c05b`; the served bundle is byte-identical to the tested build. Production smoke **25/25**: routes, SPA fallback, manifest, activated service worker, precache, installability, live sign-in, no Demo Mode, session restore, logout. The bundle holds only the public anon JWT (no service-role key, no `sb_secret`). Vercel env has only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. |
| 2 | Authentication | **PASS WITH BLOCKERS** | Sign-in, keyboard sign-in, session restore, logout, suspension (live-session cut-off, ban), and role guards all pass on production. **Blocker C1:** email confirmation is on without SMTP, so signup fails (429). Password reset is **not verified** end-to-end (needs SMTP). The auth-resolution race was fixed in `0bec896`. |
| 3 | Tenant isolation | **PASS** | SQL RLS suite (125 checks) and the full 327-check SQL gate from an empty DB. API tenant isolation **41/41 on production**. Cross-country T1–T4 and T9 on production. Production has **0** anon table/function grants, **0** tables without RLS, and **0** SECURITY DEFINER functions without a pinned `search_path`. |
| 4 | Staff lifecycle | **PASS WITH BLOCKERS** | Invite → accept → provisioning → role → suspend/reactivate/remove → audit: API **47/47** and UI **17/17** on production. Invite links use the canonical origin (secrets verified by digest). **Blocker C1:** a *new* invitee can't create their account while email confirmation is on without SMTP. |
| 5 | Transaction integrity | **PASS** | Atomic, tenant-checked RPCs (sales, POs, products). Server-computed totals. Every sale is currency-stamped and immutable (**0 unstamped** on production). **0 duplicate purchases** on production. Mismatched-currency sale → 409 (X1). |
| 6 | Inventory integrity | **PASS** | Stock changes only through RPCs, each writing a movement. **0 negative stock** on production. Every app-managed product reconciles stock = Σ movements. The 5 rows that don't are synthetic fixtures that the seeders reset directly (explained in the runbook query). |
| 7 | Offline operation | **PASS** | IndexedDB cache and durable queue; crash / reopen / reconnect sync exactly once. The **stranded-"syncing" defect was found and fixed** (`537c05b`); the deterministic check 3.7 fails on the old build and passes on the new one. Offline suites: see the production results below. |
| 8 | Realtime synchronization | **PASS** | Realtime API suite on production. Device-B gap reconciliation (recovery 2.x) on production. The Realtime *service outage* (5.x) was verified **locally only**, because hosted Realtime can't be stopped from here. |
| 9 | Idempotency | **PASS** | Every replayable RPC is idempotent. The receipts table has 1 receipt per mutation (recovery 3.5, 3.7), and replays return the first result (SQL 40-suite). |
| 10 | Storage | **PASS** | Private `documents` bucket, tenant-prefixed policies, MIME/size limits, cross-tenant denial and compensating cleanup, from the API suite. File backup is covered under §11. |
| 11 | Backup / recovery | **FAIL** | **No platform backups, PITR off** (`supabase backups list`, 2026-09-23). A logical restore was rehearsed into a fresh DB: **19/19 tables exact**, isolation and RPCs working, dump + restore ≈ **1 min 41 s**. The full-environment RTO is **not measured**, the production RPO is **unbounded**, and storage is not in the dumps. → **C2** |
| 12 | Monitoring | **PASS WITH BLOCKERS** | `app_logs` (error boundary), Supabase logs and ready-made SQL checks in the runbook. **No automated alerting**, so someone must look. Owners are unnamed (→ C3, C4). Adequate for one pilot pharmacy with daily checks. |
| 13 | Mobile UX | **PASS** | UX audit of 131 page×viewport combinations: **0 horizontal panning, 0 clipped text**, 0 undersized targets in the workspace. Core tasks pass at 360 px. |
| 14 | Accessibility | **PASS** | axe (WCAG 2.2 AA): no critical or serious issues on any gate screen, the auth pages or the shell. Token contrast **27/27**. Keyboard sign-in and focus rings verified. |
| 15 | Performance | **PASS** | Main JS **159.42 kB gzip** (budget ~165 kB). CSS 10.54 kB. Slow 3G + 4× CPU: login usable in **4.46 s**. 0 third-party hosts. |
| 16 | Liberia configuration | **PASS** | Production pharmacies are LR / USD / Africa/Monrovia / en-LR. Same five payment methods in the same order. The UTC-midnight boundary is verified on production. Money reads US$. |
| 17 | Multi-country architecture | **PASS** (technical) | Registry and 0018 are on production, and the schema matches the tested build exactly. Ghana, Kenya and Rwanda synthetic pilots pass **on production**. This is **not** a market-entry claim. |
| 18 | Regulatory readiness | **NOT VERIFIED** | No legal research was done, by design. Liberia's items (tax on medicines, receipts, licensing, data protection) are open in the backlog. Acceptable for a controlled pilot under a pilot agreement (checklist item 7). |
| 19 | SMTP / email | **FAIL** | Built-in mailer only: the invite probe returned `email rate limit exceeded`, and signup returned 429. **OPEN — go-live blocker for email-based auth** (C1). WhatsApp invite links work for existing accounts only while email confirmation is on. |
| 20 | Incident response | **PASS WITH BLOCKERS** | Runbook updated with Phase 9 symptoms, integrity queries, and the SMTP / password-reset reality. **Owners unnamed (C3, C4).** |

---

## Production verification (Steps 3–7)

### Migration 0018 (Step 3)

- **Before:** 0001–0017 were applied remotely and only 0018 was pending (`supabase migration list
  --linked`; `db push --dry-run`).
- **Drift check** before applying: a catalog fingerprint of columns, constraints, policies,
  function bodies (md5), triggers, RLS, grants and the realtime publication, compared with a fresh
  local 0001–0017 build. **Identical**, except for Supabase's platform `ensure_rls` event trigger
  (`rls_auto_enable`), which is benign and protective.
- **Pre-migration data dump** taken (chmod 600, not in the repo).
- **Applied** with `supabase db push`.
- **After:** the remote fingerprint equals the validated local 0001–0018 build. **647 objects
  identical.**
- **Verified on production:**
  - Existing pharmacies were backfilled to LR / USD / Africa/Monrovia / en-LR.
  - The registry has 7 countries.
  - **All 59 existing sales, 21 orders and 3 supplier prices were stamped USD.**
  - Triggers are present, and the method CHECK was widened.
  - RLS is on for every table, including `pharmacy_config_changes`.
  - The registry is unreadable by `authenticated`, and anon can't use the new RPCs.
  - Authenticated users can't write `country_code`.
  - The lock (T6/T7), audit (T8) and tenant scoping (T9, T10) all hold.

### Edge Function origins (Step 7)

`NEVOUT_APP_ORIGIN` was set to the team alias and `NEVOUT_ALLOWED_APP_ORIGINS` to an unknown
value. Both were reset. SHA-256 digests now equal the target values exactly. Invite links now use
`https://nevout-meds-liberia-pilot.vercel.app`, as verified by a probe. `staff-admin` v3 is
current with the repository.

### Regression against the deployed production site (Steps 4–6)

This run is against **`https://nevout-meds-liberia-pilot.vercel.app`**, the bundle Vercel actually
serves, on the live backend, for the final commit `537c05b`, using synthetic tenants only.

| Suite | Covers | Result |
|---|---|---|
| Production smoke | reachability, routes, PWA, service worker, installability, auth, no Demo Mode | **25 / 25** |
| Correctness | money shown = server, pharmacy identity, dates | **14 / 14** |
| Core flows A–E | dashboard, inventory, adjust, reorder → PO, sale, customer, Price Compare, expiry, reports, financials; axe | **81 / 81** |
| Workflows | customer persistence, real dates, staff screen, financials | **15 / 15** |
| Foundation | auth pages, keyboard, shell, offline states, invite UI, sign-out; axe | **45 / 45** |
| Offline-first | offline sale, stock adjustment, customer, reminder, close / reopen, sync exactly once | **21 / 21** |
| Offline sale / stock | offline sale and adjustment at 360 px, reconnect sync | **25 / 25** |
| Staff UI | owner and staff login, invite, suspension, roles | **17 / 17** |
| Recovery | long offline gap, suspension while queued, crash during sync, stranded entry (3.7) | **22 / 22** (5.x outage: local only, 26/26) |
| API tenant isolation | cross-tenant reads, writes and relationships; storage; atomicity | **41 / 41** |
| API staff lifecycle | invite → accept → role → suspend → remove → audit | **47 / 47** |
| API realtime / offline | realtime propagation, idempotent replays | **24 / 24** |
| Country pilots (LR / GH / KE / RW) | country config, currency, no cross-currency ranking, UTC midnight, phone, address labels, payment methods, offline currency, isolation, settings lock and audit | **46 / 46** |
| **Total on production** | | **423 / 423** |

**Integrity after all test traffic** (read-only, production): 144 sales stamped USD / GHS / KES /
RWF. **0** negative stock, **0** duplicate purchases, **0** duplicate customers, **0** unstamped
sales.

**Non-browser gates on the final commit:** SQL **327/327** from an empty DB, country unit tests
**77/77**, design-token contrast **27/27**.

---

## Synthetic production cleanup (2026-09-23)

Production is public-facing, and the public repository contains the synthetic test password, so
all synthetic data was removed once testing was complete.

### Before deletion

1. **Allow-list verified.**
   - Production held exactly the 5 synthetic pharmacies (E2E Pharmacy A/B, Pilot Pharmacy
     Accra/Nairobi/Kigali).
   - All 6 auth users were `@e2e.local`, and all 6 profiles belonged to allow-listed pharmacies.
2. **Nothing else would be affected.**
   - Every populated public table had **100%** of its rows in allow-listed pharmacies: 0 rows
     without a pharmacy, 0 in any other pharmacy.
   - All 6 storage objects were under E2E Pharmacy A's prefix.
3. **Pre-cleanup snapshot.** A data dump (`public`, `private`, `auth`; 337 KB), a schema dump,
   and copies of the 6 storage files were saved owner-only outside the repository. That was needed
   because production has no platform backups.
4. **Guarded, atomic script.**
   - It aborts (rolls back) if any pharmacy, user or tenant row falls outside the allow-list, and
     re-asserts zero leftovers and an intact country registry before committing.
   - It was rehearsed on a restored copy of production.
   - Its abort path was proven: with a non-allow-listed pharmacy present, nothing is deleted.

### Deleted

| Item | Rows |
|---|---|
| Auth accounts (`@e2e.local`) | 6 (identities and sessions cascaded) |
| Pharmacies | 5 |
| Sales / sale lines | 144 / 140 |
| Stock movements / inventory / products | 237 / 15 / 15 |
| Customers / reminders | 79 / 21 |
| Suppliers / prices / orders / order lines | 7 / 5 / 41 / 47 |
| Idempotency receipts | 312 |
| Staff audit log / invitations / profiles | 157 / 52 / 6 |
| App events / config-change audit | 34 / 10 |
| Storage files (`documents` bucket) | 6, via the Storage API |

**Not touched:** schema, migrations, the country registry, Edge Functions and secrets, storage
bucket configuration, auth configuration and platform settings.

### Verified after deletion

| Check | Result |
|---|---|
| `@e2e.local` auth users | **0** (total auth users 0) |
| Synthetic / any pharmacies | **0** |
| Orphaned tenant records | **0**: every public table is empty. Only `private.country_rules` (7) holds data. |
| Migrations 0001–0018 | **18 applied** |
| Schema, policies, grants, function bodies, triggers, RLS, realtime publication | **identical** to before: 650-object fingerprint, **0 differences** |
| RLS | 21 tables with RLS, 0 without; 51 policies |
| Country registry | unchanged (md5 match, 7 countries) |
| Storage | `documents` bucket configuration unchanged; 0 objects |
| Edge Function | `staff-admin` ACTIVE v3; both origin secrets match their digests |
| Production site | all routes render, `/platform` → sign-in, service worker active, no Demo Mode, **0 page errors**, same bundle `index-DTf7Yg3O.js` |

**Not reseeded, as instructed.** The regression suites that sign in can't run against production
any more. Future end-to-end runs should use a **separate staging project** (recommended), or a
fresh random `NEVOUT_TEST_PASSWORD` followed by an immediate cleanup.

---

## NO-GO findings recheck (Step 14)

The original multi-user NO-GO audit was carried out before this project's remediation began. Its
findings are recorded in the remediation brief (Phases 1–6) and in the phase reports. Every
finding is listed below.

| # | Original finding | Status | Evidence |
|---|---|---|---|
| N1 | Migrations not reproducible (SQL errors in 0002 / 0008 / 0010) | **FIXED** | Repaired (Phase 1). `run_local_validation.sh` applies 0001→0018 to an empty DB. Remote history matches, and the schema fingerprint is identical. |
| N2 | `xlsx` high-severity advisory (spreadsheet uploads) | **FIXED** | Replaced with the patched SheetJS 0.20.3 tarball. It's absent from `npm audit`. |
| N3 | Vite / esbuild advisories | **MITIGATED** | Dev-server only, never shipped. The production bundle scan is clean. |
| N4 | React Router advisories | **MITIGATED** | 2 moderate. SSR is not used. Redirect targets pass through `safeInternalPath`. The v7 upgrade is tracked. |
| N5 | SPA / PWA routing unverified | **FIXED** | Production smoke 25/25. |
| N6 | Staff can change own role | **FIXED** | Column-level grants plus a trigger (Phase 2). SQL RLS suite; API tenant isolation 41/41 on production. |
| N7 | Staff can change own `pharmacy_id` / tenant | **FIXED** | Same mechanism and tests as N6. |
| N8 | Owner can create or promote an admin | **FIXED** | No insert policy for API roles. `set_staff_role` restricts roles (SQL 30-suite; API staff 47/47 on production). |
| N9 | Pharmacy A can access Pharmacy B | **FIXED** | RLS on `private.pharmacy_id()`. SQL 125-check suite. API 41/41 and pilots T1–T4 and T9 on production. |
| N10 | Recursion-prone RLS helpers (`current_profile`, `is_admin`, `same_pharmacy`) | **FIXED** | `private` SECURITY DEFINER helpers with `search_path=''`. Tests run under `statement_timeout`, and there have been no hangs since Phase 2. |
| N11 | SECURITY DEFINER hardening | **FIXED** | Production has **0** definer functions without a pinned `search_path`. All have explicit tenant checks and least-privilege execute. |
| N12 | `adjust_stock` / `record_purchase` unsafe | **FIXED** | Full validation before writing, row-locked updates, forced `staff_id`. SQL 20/40 suites. Sales and adjustments pass on production. |
| N13 | Cross-tenant relationships (customer / product / inventory / purchase) | **FIXED** | 13 composite FKs. SQL suite. |
| N14 | Server accepts negative quantities, invalid prices or methods, foreign IDs, impossible stock | **FIXED** | CHECK constraints plus RPC validation. The method list is now per-country (0018) and still enforced. SQL 20/50 suites. |
| N15 | `anon` over-exposure | **FIXED** | Production: 0 anon table grants, 0 anon function grants. |
| N16 | Customer creation not persisted | **FIXED** | Workflows suite 15/15 on production (persists and survives reload). |
| N17 | Seeded Staff data | **FIXED** | `staff_performance` returns real data (Phase 3). Foundation / workflows on production. |
| N18 | Misleading synthetic financial data | **FIXED** | Removed in Phase 3. The last dead fabricated CSV builder was deleted in Phase 9. Correctness 14/14 on production. |
| N19 | Hard-coded dashboard dates | **FIXED** | Real date, now the pharmacy's business date (Phase 9). Core flows A1 and workflows on production. |
| N20 | Non-atomic purchase orders | **FIXED** | `create_purchase_order`: single transaction, server total. Core flows C8 on production. |
| N21 | Non-atomic product creation | **FIXED** | `create_product`: product + inventory + opening movement in one transaction. SQL 20-suite. |
| N22 | Document upload / metadata partial failure | **FIXED** | Compensating cleanup, and the `documents` bucket was created (0013). API suite. |
| N23 | `app_feedback` FK / nullability | **FIXED** | Asserted in the migration and behaviour-tested (SQL 20-suite). |
| N24 | Staff lifecycle missing (invite → accept → provision → suspend → remove → audit) | **FIXED** in code / **OPEN** in production config | Edge Function plus RPCs. API 47/47 and UI 17/17 on production. A **new** invitee can't create an account until C1. |
| N25 | Multi-user sync missing | **FIXED** | Realtime plus reconciliation. API realtime and recovery 2.x on production. The Realtime-service outage was verified locally. |
| N26 | Offline-first incomplete (queue, replay, crash recovery, conflicts) | **FIXED** | Offline-first 21, offline sale 25 and recovery suites. The crash-strand defect found today was fixed and verified (3.6 / 3.7). |
| N27 | Service-role key must never reach the browser | **FIXED** | Production bundle scan: anon JWT only. Git history scan: **no JWT or secret ever committed**. |
| N28 | Backups / recovery (go-live requirement) | **OPEN** | No platform backups. The logical restore was rehearsed. → C2 |
| N29 | SMTP / email (go-live requirement) | **OPEN** | Not configured. → C1 |
| N30 | Incident and backup ownership (go-live requirement) | **OPEN** | Names missing. → C3, C4 |

**Summary (30 findings):**

| Status | Count | Findings |
|---|---|---|
| **FIXED** | 24 | N1, N2, N5–N23, N25–N27 |
| **MITIGATED** | 2 | N3, N4 |
| **Fixed in code, OPEN in production configuration** | 1 | N24 |
| **OPEN** | 3 | N28–N30 (go-live items) |

No open item is a software defect. The remaining open items are the real-data conditions: SMTP
(C1), backups (C2) and named owners (C3, C4).

---

## Defects found and fixed in this final pass

| Defect | Severity | Found by | Fix | Verified |
|---|---|---|---|---|
| Profile resolutions raced: a stale lookup could route a signed-in owner to `/onboarding` | Medium (UX / trust) | Production foundation suite (1 failure) | `0bec896`: only the latest resolution applies | Foundation 45/45 ×3 on production |
| Offline entries stranded in `syncing` after a crash were never resent | **High** (a sale could stay unsynced forever) | Production recovery suite (3.x) | `537c05b`: session-stamped sends; stale `syncing` entries are resent, exactly-once via idempotency | New 3.7: fails on the old build, passes on the new one (local and production) |

## Known limits accepted for the pilot

- One currency per sale (no mixed USD / LRD). See [docs/country/MIXED_CURRENCY_DESIGN_NOTE.md](docs/country/MIXED_CURRENCY_DESIGN_NOTE.md).
- English-only UI (locale-aware numbers and dates only).
- The admin console reports in UTC.
- Phone validation checks shape only.
- React Router v7 upgrade pending (moderate, mitigated).
- Supabase CLI is two minor versions behind.
