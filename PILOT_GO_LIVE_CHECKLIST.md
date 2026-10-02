# Pilot go-live checklist: first real Liberia pharmacy

This lists what **people** still have to do before the first real pharmacy is onboarded. The
software build is complete: see [BUILD_COMPLETION_REPORT.md](BUILD_COMPLETION_REPORT.md).

**Pilot policy**
- Supabase Pro and managed backups/PITR are **deferred** until the pilot is running or paying
  customers join.
- **No real pharmacy or patient data** goes in until the independent backup is scheduled and
  restore-tested against production.
- SMTP stays OPEN.
- The owner fields may stay TBD until go-live, but they must be filled **before real data**.

## Blockers before real data

- [ ] **1. Independent backup running and restore-tested against production**
  (`docs/BACKUP_AND_RECOVERY.md` §7). **Deferred by decision until before the first real
  pharmacy data**, together with Supabase Pro. That deferral does not block configuration or
  synthetic-data testing. **It remains the hard gate: real pharmacy or patient data is
  prohibited until this item is done.** The tooling is built and was verified against
  production on 2026-09-23 and 2026-09-25. What's left is operational:
  - choose a backup host and create `ops/backup/backup.env` there (`chmod 600`);
  - generate the passphrase and store a copy **offline**;
  - choose the off-site destination (S3 / R2 / B2 / other) and create a least-privilege key;
  - install the schedule from `ops/README.md`:
    - nightly database and storage backups;
    - an hourly health check;
    - a weekly verify;
  - run **one restore test from a scheduled artifact** and see `restore-db.sh` report `ok:true`.

- [x] **2. Backup owner named:** **Mo Soumaoro** (`docs/PILOT_INCIDENT_RUNBOOK.md`). Watches the
  `BACKUP` alerts and performs restores.

- [x] **3. Incident owner named:** **Mo Soumaoro** (`docs/PILOT_INCIDENT_RUNBOOK.md`). No phone or
  WhatsApp number is recorded yet; add the real ones when they exist (none are invented).

- [ ] **4. A way to create accounts** (SMTP is **OPEN**). Choose one:
  - **(a) Configure production SMTP** (Authentication → Emails → SMTP). This is recommended, and
    it also enables password reset. The app needs no code change. Then check the redirect
    allow-list (`https://nevout-meds-liberia-pilot.vercel.app/**`) and verify signup, invite and
    reset with a real mailbox (`docs/STAFF_AUTH_ARCHITECTURE.md`).
  - **(b) The pilot provisioning fallback** (built, tested, and **proven in production** by the
    live MFA proof on 2026-10-01):
    - the operator verifies the owner out of band, then runs `ops/provision/provision-owner.mjs`;
    - the owner sets their own password from a single-use link.
    - Email confirmation **stays on**.
    - **Limitation:** there's no self-service password reset for active accounts until (a).

  Turning off "Confirm email" globally is **not** the chosen approach.

- [ ] **5. Support contacts.** Email is **done**; only WhatsApp (deferred) remains.
  - [x] **Email:** `support@nevoutmeds.com`, confirmed monitored. `VITE_SUPPORT_EMAIL` is set in
    Vercel → Production and deployed (bundle `index-CIvISV3C.js`).
  - [x] **Production support-email test: CLOSED (2026-10-02).**
    - **Run:** by the operator, with `ops/security/live-mfa-proof.mjs --support-email
      support@nevoutmeds.com`. Synthetic owner `nevout-support-test-*@example.com`, pharmacy
      "SYNTHETIC SUPPORT TEST — DELETE". 19/19 passed.
    - **What it showed:** Account menu → Help & feedback has exactly one **Email support** link,
    and its recipient is exactly `support@nevoutmeds.com`. No other or fallback address appears.
    - **Cleanup:** complete, and read-only verified (production empty again).
  - **Demo requests:** `demo@nevoutmeds.com` (public website), confirmed monitored.
  - **WhatsApp:** **TBD / deferred.** Until `VITE_SUPPORT_WHATSAPP` is set, Help → WhatsApp
    support opens without a recipient.

**Onboarding the first pharmacy** follows the pilot pack: [docs/pilot/README.md](docs/pilot/README.md),
starting with [PILOT_LAUNCH_MASTER_CHECKLIST.md](docs/pilot/PILOT_LAUNCH_MASTER_CHECKLIST.md).

- [ ] **5b. Two-step verification is ready (Phase 11).** The platform side is **done**. Only
  the first-owner item below remains, and it happens at onboarding.
  - [x] Phase 11 is **deployed** (2026-09-25: migration `0020`, `staff-admin` v4, frontend
    `m42920c1a`).
  - [x] **TOTP (App Authenticator) is enabled.** Proven in production: the live proof enrolled
    and verified a TOTP factor. Owners cannot reach any pharmacy data without it.
  - [x] The authorized owner-MFA reset operator is **Mo Soumaoro**. The procedure is in
    `docs/security/MFA_OPERATIONS.md` §4, and `ops/security/reset-mfa.mjs` worked in production
    during the live proof.
  - [x] **Live production MFA proof: CLOSED.**
    - **Run:** 2026-10-01, by the operator. 44/44 checks, 0 failed, with synthetic
      `@example.com` accounts only.
    - **Cleanup:** auth users 0 → 0, pharmacies 0 → 0, no synthetic or tenant rows left.
    - **Read-only verification, 2026-10-02 UTC:** migrations `0001`–`0020`; all 22 public
      tables empty; 0 factors and sessions; RLS on all tables; schema fingerprint identical to
      the `0001`–`0020` build; `staff-admin` v4 healthy; signed-out smoke 21/21; project
      `qohpyeqyveusnxhnbtxz`; bundle free of secrets.
    - Details: `PHASE_11_SECURITY_OBSERVABILITY_REPORT.md` → Live production MFA proof.
  - [ ] The first owner has an authenticator app on their **own** phone, with the app's cloud
    backup switched on. They set it up at first sign-in (about two minutes).

## Before or during week one

- [ ] **6. Pilot agreement covers personal data** (customer names, phone numbers, purchase
  history; research backlog X8). Tell pharmacies not to record diagnoses in free-text notes.
- [ ] **7. Decide whether owner self-signup stays open.** With SMTP, anyone can create an owner
  account and an (isolated) pharmacy. For a controlled pilot, you may prefer operator provisioning
  only.
- [ ] **8. Brief the pilot pharmacy** (`docs/PILOT_OPERATOR_GUIDE.md`):
  - US$ money, one currency per sale;
  - Liberia time;
  - offline mode and the sync badge;
  - who to call.
- [ ] **9. Alert delivery:** set `NEVOUT_ALERT_WEBHOOK_URL`, or make sure someone reads the health
  check output every day.
- [ ] **10. Supabase CLI:** keep it signed in with the NevOut account; update it (v2.98.2 → v2.117).
- [ ] **11. Staging project** (`STAGING_SETUP.md`), so future end-to-end runs never touch
  production. It needs approval, because it may be billed.

- [ ] **12. Error monitoring (optional, recommended).** Create the Sentry project and set
  `VITE_SENTRY_DSN` in Vercel (see `docs/observability/SENTRY_PRIVACY_POLICY.md` §6). Without
  it, monitoring is simply off; nothing else changes.

## Deferred (post-pilot / paid customers)

- Supabase Pro: daily managed backups, then PITR.
- Dependency major upgrades: react-router 7, Vite 8 (`docs/DEPENDENCY_SECURITY.md`).

## Already done (no action needed)

- Migrations `0001`–`0019` are on production. The schema fingerprint and country registry are
  identical to the tested build.
- Frontend deployed from commit `93b7f5c`:
  - production smoke 21/21, signed out; production holds no test accounts;
  - only the anon key is in the bundle.
- Health check against production: **HEALTHY**. `ops_health` is refused to anonymous callers.
- Independent backup tooling: production DB and Storage backups, verified and restore-rehearsed
  (2.2 s). This was a one-off verification, not the schedule (item 1).
- Synthetic test data removed from production (2026-09-23). Production holds **no tenant data**.
- Edge Function origins verified. Recovery tags `pre-phase8-hardened` and
  `post-phase9-multicountry`.
