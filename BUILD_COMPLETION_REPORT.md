# Build completion report: NevOut Meds controlled Liberia pilot

Date: 2026-09-23 · Branch `phase8/ux-design-system` · Build commit `93b7f5c`, plus the
documentation commit that adds this report.

Production (updated 2026-09-25, see [the Phase 11 update](#update-2026-09-25-phase-11-mfa-rbac-and-monitoring)):
- frontend `https://nevout-meds-liberia-pilot.vercel.app`, Vercel deployment `m42920c1a`,
  serving `index-ePvu7uti.js` from commit `5594ddd` (release `nevout-meds@5594dddfb7b5`);
- Supabase `qohpyeqyveusnxhnbtxz`, migrations `0001`–`0020`; Edge Function `staff-admin` v4;
- **no tenant data** (0 pharmacies, 0 profiles, 0 auth users).

## Update 2026-09-25: Phase 11 (MFA, RBAC and monitoring)

Details are in [PHASE_11_SECURITY_OBSERVABILITY_REPORT.md](PHASE_11_SECURITY_OBSERVABILITY_REPORT.md).

**What went live:**
- **Two-step verification:** TOTP through Supabase Auth, **required for owners and platform
  admins** and enforced in the database (at aal1 an owner reaches no pharmacy data). It is
  optional for staff, and required once a staff member enrolls.
- **Account security** screen, and **owner reset** of a staff member's authenticator.
- **Capability-based authorization:** 32 capabilities (staff 15, owner 31, admin 32).
- **Tightenings:** documents are owner-only; stock import is owner-only.
- **Security event log.**
- **Privacy-first Sentry code,** currently **disabled** because no DSN is set.

**Deployment checks:**
- no drift before the migration;
- encrypted backups before and after;
- dry run showed only `0020`;
- production fingerprint equals the tested `0001`–`0020` build in all 7 categories;
- 0 tables without RLS;
- `staff-admin` v4 with origins verified by digest;
- the served bundle equals the scanned build except chunk hashes;
- production smoke **21/21**; health check **HEALTHY**;
- all 52 deployed assets are free of secrets and source maps.

**Regression before deploying:** 1,162 checks, 0 failed (SQL 435, UI 405 + Sentry 26, API 148,
unit and static 148). Main JS 163.03 kB gzip.

**Rollback:**
- **frontend:** promote `k30br88vx`;
- **database:** roll forward (additive), with the pre-migration backup
  `nevoutmeds-db-prod-20260925T183705Z` for reference;
- **Edge Function:** redeploy the previous commit's `staff-admin`.

**New human items:**
- confirm **Authentication → Multi-Factor → TOTP (App Authenticator) = Enabled**;
- optionally create the Sentry project and set `VITE_SENTRY_DSN`;
- give the first owner an authenticator app on their own phone.

## Update 2026-09-24: frontend deployment

This was a **frontend-only** deployment. There were no migrations, no Edge Function changes and
no data changes: the database and `supabase/functions` are identical to the previous production
commit (`63048da`).

**What went live (all previously local only):**
- **Phase 10** pilot onboarding fixes (`263283b`): import validation, dismissible conflicts, the
  unsynced sign-out warning, configurable support contacts.
- The **premium UI/UX second pass** (`24624a9`).
- The **final polish** (`584a226`): product detail, Staff, Documents, tablet layouts, icon
  cleanup. Details are in [PREMIUM_UI_UX_UPGRADE_REPORT.md](PREMIUM_UI_UX_UPGRADE_REPORT.md) §12.

**Checks before deploying** (local stack, synthetic data):

| Check | Result |
|---|---|
| UI and API suites | **15 suites, 471 checks, 0 failed**: ui_premium 18, ui_core_flows 81, ui_foundation 53, ui_staff_lifecycle 17, ui_workflows 15, ui_phase8_correctness 14, ui_offline_first 21, ui_offline_sale_stock 25, ui_recovery 26, ui_import 32, ui_country_pilots 46, ui_owner_provisioning 10, api_tenant_isolation 41, api_staff_lifecycle 47, api_realtime_offline 25 |
| SQL | 354/354 |
| Unit | 77 |
| Design-token contrast pairs | 27 |
| UX audit | 118 page×viewport combinations at 360, 430, 768, 1024 and 1366 px: 0 overflow, 0 clipping, 0 text under 12 px, 0 contrast failures, 0 unlabeled controls, 0 targets under 24 px |
| `npm run build` | Main JS **161.21 kB gzip** (target about 165 kB) |
| Bundle scan | Only the public anon key is embedded: 0 non-anon JWTs, no `sb_secret_` |

**Checks after deploying** (read-only):

| Check | Result |
|---|---|
| Served bundle | `index-CpTWfeTG.js`, **identical** to the locally built and scanned `dist/` |
| `prod_smoke.e2e.mjs` (signed out) | **21/21**: reachability, manifest and icons, `/sw.js`, all routes, protected routes redirect to `/login`, service worker activates and precaches, installability, no Demo Mode, correct Supabase project, no unexpected console errors. Signed-in checks were skipped because production has no test accounts, by design. |
| `ops/monitor/health-check.mjs` | **HEALTHY**: site, API, `staff-admin`, `ops_health`. Last 24 h: 0 client errors, 0 sync conflicts, 0 sync failures, 0 storage failures. Integrity: every check at 0. Pharmacies: 0. |
| Layout at 360, 768, 1024 and 1366 px | Home, login and the `/platform` redirect render with no sideways scroll |
| Support contacts | No email contact is published: the fallback `support@nevoutmeds.com` was removed, and email support appears only when `VITE_SUPPORT_EMAIL` is set. `VITE_SUPPORT_WHATSAPP` is also unset, so WhatsApp support opens with no recipient. The home page still shows `demo@nevoutmeds.com`, as it has since the initial deployment (to be confirmed as monitored). |

**Rollback:** promote the previous production deployment `5tx6ir9e0` (Vercel → Deployments), or
run `vercel rollback`.

**Backup alert:** the health check reported the last backup artifacts at 25.3 h old. As §2
explains, `ops_health` starts raising the intended `BACKUP` alert at about 26 h, and keeps
raising it until the independent backup schedule is installed.

## Verdict

| Question | Answer |
|---|---|
| **A. Is the software build complete for the controlled pilot?** | **YES** |
| **B. Are all human / operational go-live items complete?** | **NO.** The items below are for people to do. No engineering is outstanding for them. |

**Real pharmacy or patient data must not be entered until:**
- the independent backup is **scheduled and restore-tested against production**;
- the backup and incident owners are named;
- there is a way to create accounts (SMTP, or the provisioning fallback).

## Explicit status of the policy items

| Item | Status |
|---|---|
| SMTP | **OPEN.** The app is SMTP-ready: redirects, "check your email" states and honest delivery-failure messages. Email confirmation stays **on**. Password recovery is **not** claimed as ready. |
| Incident owner | **TBD** |
| Backup owner | **TBD** |
| Supabase Pro / managed backups / PITR | **DEFERRED UNTIL PILOT / PAID CUSTOMERS** |
| Independent logical backup | **MUST BE COMPLETE BEFORE REAL DATA.** The tooling is built and verified against production (below). The schedule, destination and owner are still to be set up. |

---

## 1. ENGINEERING COMPLETE

| # | Item | What was built | Evidence |
|---|---|---|---|
| 1 | **Independent DB backup** | `ops/backup/backup-db.sh`. **What it covers:** `public`, `private`, `auth.users` + `auth.identities`, migration history, and the country registry. **What it produces:** a manifest (row counts, schema fingerprint, registry md5, integrity invariants); a tar+gzip archive encrypted with AES-256-GCM (scrypt KDF), with a deterministic name `nevoutmeds-db-<project>-<UTC>.tar.gz.enc` and `.meta.json`. **How it runs:** decrypt-verify before upload, retention with keep-min, JSONL log, heartbeat, and a non-zero exit on any failure. **Engines:** `pg` (DB URL file) or `supabase-cli` (no password on disk). **Limitations** (other auth tables, Storage not in DB dumps, platform config) are documented. | Local: 2.6–2.8 s. **Production: 139 s / 169 s, OK.** Failure path: exit 1 plus a failure heartbeat. |
| 2 | **Storage backup** | `backup-storage.sh` / `restore-storage.sh`. Every bucket and object goes through the service-role API. A checksum manifest is written, and the restore re-downloads and verifies SHA-256. | Local: 23 objects backed up; 19 deleted, then 23 restored identical. Production: `documents` bucket, 0 objects, OK. |
| 3 | **Destination abstraction** | `local`, `dir:<path>`, `s3` (any S3-compatible: AWS / R2 / B2 / MinIO, via a dependency-free SigV4 client with read-back confirmation), and `rclone:<remote>`. No vendor is hard-coded. | Local S3 endpoint: upload, list, prune and download all verified. |
| 4 | **Restore + rehearsal** | `restore-db.sh`. It refuses the source and any non-empty target. The schema comes from the backup or from the migrations, and default privileges are neutralised so grants match exactly. Data loads in replica mode. It validates against the manifest (tables, rows, 547 schema objects) and a functional check. `rehearse-local.sh` creates an isolated fresh DB. | Synthetic: 25 tables and 2,326 rows equal, functional OK, **4.45 s** (9.09 s from the migrations). **Production artifact: 26/26 tables, 547/547 objects, 2.2 s.** |
| 5 | **Staging plan** | `STAGING_SETUP.md`: creation steps, configuration parity, the seeding rules, and production refusal guards. No project was created. | — |
| 6 | **Monitoring** | Migration `0019`: `private.backup_runs`, `ops_record_backup_run` (service only), `ops_health()` (admin/service only). **What it checks:** backup age and failures, client errors, sync conflicts and failures, storage failures, integrity invariants, silent pharmacies. `ops/monitor/health-check.mjs` adds site / API / Edge Function reachability and an optional webhook. The client now reports `sync_conflict`, `sync_failed` and `storage_*` events. Auth and Edge Function logs are covered by the Log Explorer queries in `docs/MONITORING.md`. | SQL 60-suite, 27 checks. Production: alerted correctly with no backups, then **HEALTHY**. Anonymous callers are refused (`42501`). |
| 7 | **SMTP-ready auth** | Signup redirects to `/onboarding`, and invite signup returns to its invitation. Accept-invite shows a "Check your email" state (before, it gave no feedback). Email-delivery errors show an honest message. No fake SMTP; confirmation stays on. | UI suites; provisioning e2e |
| 8 | **Provisioning fallback** | `ops/provision/provision-owner.mjs`: the operator verifies the person, the tool creates a confirmed user with no password and a single-use setup link, and the person sets their own password. It refuses existing or active accounts, and writes an audit log with no links in it. | `ui_owner_provisioning` **10/10** |
| 9 | **Dependency review** | `npm audit` reviewed. No non-major fixes exist. Vite / esbuild are dev-server only. React Router's open redirect is mitigated by `safeInternalPath`, and its SSR item doesn't apply. See `docs/DEPENDENCY_SECURITY.md`. | Bundle and git-history secret scans clean |
| 10 | **UX polish** | **Public home page:** fabricated testimonials and figures removed; the preview is labelled SAMPLE DATA; the placeholder phone number is removed; the contact form now opens the user's email app (mailto) instead of silently discarding input. The PWA theme colour now matches the design system. Pricing tiers were left untouched (owner content, flagged for review). | UX sweep: app screens clean |
| 11 | **Performance** | Main JS **159.68 kB gzip**, CSS 10.54 kB. The spreadsheet worker (123 kB) and the home page (16 kB) are lazy-loaded. 25 requests on first load, **0 requests in 2 minutes idle**. | — |
| 12 | **Documentation** | `README.md`, `STAGING_SETUP.md`, and in `docs/`: `BACKUP_AND_RECOVERY`, `MONITORING`, `PRODUCTION_DEPLOYMENT`, `OFFLINE_ARCHITECTURE`, `STAFF_AUTH_ARCHITECTURE`, `DEPENDENCY_SECURITY`, `PILOT_OPERATOR_GUIDE`, and an updated `PILOT_INCIDENT_RUNBOOK`, plus `ops/README.md`. The TBD markers for the owners, SMTP and Pro/PITR are included. | — |
| 13 | **Test-tooling safety** | `seed_remote.mjs` and the country pilot suite refuse the production project. The production smoke test needs an explicitly supplied account and otherwise runs signed out. | Refusal tested (exit 2) |

### Regression (all on the local stack with synthetic data, unless marked production)

| Suite | Result |
|---|---|
| SQL, fresh DB from migrations (RLS, correctness, staff, offline, country, ops) | **354/354** |
| Country config unit / design-token contrast | **77/77** · **27/27** |
| Typecheck + production build | OK |
| `ui_phase8_correctness` / `ui_core_flows` / `ui_workflows` / `ui_foundation` | 14/14 · 81/81 · 15/15 · 45/45 |
| `ui_offline_first` / `ui_offline_sale_stock` / `ui_recovery` | 21/21 · 25/25 · 26/26 |
| `ui_staff_lifecycle` / `api_staff_lifecycle` / `api_tenant_isolation` / `api_realtime_offline` | 17/17 · 47/47 · 41/41 · 25/25 |
| `ui_country_pilots` / `ui_owner_provisioning` | 46/46 · 10/10 |
| **Production:** smoke (signed out), schema fingerprint, registry md5, health check | 21/21 · identical · identical · HEALTHY |

**Two first-run failures, both caused by the test run rather than the app:**
- **`ui_core_flows`** crashed inside the axe helper when `axe.run` threw mid-scan. The harness now
  retries once and reports errors. The rerun gave **81/81**.
- **`ui_workflows`** missed a 5 s persistence window for a new customer while a full SQL validation
  and a production build were running on the same machine. The customer was present after a
  reload. A quiet rerun gave **15/15**.

**Production stayed clean.** It was not seeded. The only writes were:
- migration `0019`;
- two `private.backup_runs` heartbeat rows from the verification backups.

## 2. OPERATIONAL SETUP REQUIRED (people; no code)

| Item | Where |
|---|---|
| Backup host, `backup.env` (chmod 600), passphrase stored offline | `docs/BACKUP_AND_RECOVERY.md` §3, §7 |
| Off-site destination (S3 / R2 / B2 / other) and a least-privilege key | `ops/backup/backup.env.example` |
| Install the schedule: nightly DB + storage backups, hourly health check, weekly verify | `ops/README.md` |
| **First restore test from a scheduled production artifact** | `docs/BACKUP_AND_RECOVERY.md` §5, §7 |
| Alert delivery (`NEVOUT_ALERT_WEBHOOK_URL`) or a daily reader of the health check | `docs/MONITORING.md` |
| Staging project (needs approval: it may be billed) | `STAGING_SETUP.md` |
| Supabase CLI update (v2.98.2 → v2.117) | — |

**Note on the verification artifacts.** The production artifacts made on 2026-09-23 live in a
temporary session directory with a throwaway passphrase, and are **not** a retained backup. From
about 26 h after them, `ops_health` will raise a `BACKUP` alert until the schedule runs. **That
alert is intended.**

## 3. PILOT GO-LIVE REQUIRED (before real data)

| Item | Status |
|---|---|
| Independent logical backup scheduled **and restore-tested against production** | **Not done: MUST BE COMPLETE BEFORE REAL DATA** |
| Backup owner named | **TBD** |
| Incident owner named | **TBD** |
| Account creation path: SMTP, **or** the operator provisioning fallback | **SMTP OPEN.** The fallback is ready to use. |
| Pilot agreement covers personal data | Owner / legal |
| Pharmacy briefing (`docs/PILOT_OPERATOR_GUIDE.md`) | Operator |

## 4. POST-PILOT

- Supabase Pro with managed daily backups, then PITR (**deferred until the pilot or paid
  customers**).
- Production SMTP, if not done for go-live. Then retire the provisioning fallback and enable
  self-service password reset.
- React Router 7 and Vite 8 upgrades, each with a full regression (`docs/DEPENDENCY_SECURITY.md`).
- Owner review of pricing-tier copy on the public page ("multi-branch", "Integrations + APIs").
- Liberia regulatory items (tax on medicines, receipts, licensing, data protection):
  `docs/country/REGULATORY_RESEARCH_BACKLOG.md`.

## 5. SCALE-UP (not needed for one controlled pilot)

- A full-environment hosted restore drill into a new project, to measure the real RTO.
- Hosted log drains / APM beyond `ops_health`, once pilot volume justifies it.
- Additional countries beyond Liberia need market-entry work (the architecture is ready; see
  `docs/country/COUNTRY_READINESS_MATRIX.md`).
- Multi-branch pharmacies, integrations and APIs: not built.

---

No further major feature phase was started.
