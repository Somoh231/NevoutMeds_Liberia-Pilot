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
  (`docs/BACKUP_AND_RECOVERY.md` §7). The tooling is built and was verified against production on
  2026-09-23 (§6). What's left is operational:
  - choose a backup host and create `ops/backup/backup.env` there (`chmod 600`);
  - generate the passphrase and store a copy **offline**;
  - choose the off-site destination (S3 / R2 / B2 / other) and create a least-privilege key;
  - install the schedule from `ops/README.md`:
    - nightly database and storage backups;
    - an hourly health check;
    - a weekly verify;
  - run **one restore test from a scheduled artifact** and see `restore-db.sh` report `ok:true`.

- [ ] **2. Backup owner named** in `docs/PILOT_INCIDENT_RUNBOOK.md` (currently **TBD**). This is the
  person who watches the `BACKUP` alerts and performs restores.

- [ ] **3. Incident owner named** in `docs/PILOT_INCIDENT_RUNBOOK.md` (currently **TBD**), with phone
  and WhatsApp.

- [ ] **4. A way to create accounts** (SMTP is **OPEN**). Choose one:
  - **(a) Configure production SMTP** (Authentication → Emails → SMTP). This is recommended, and
    it also enables password reset. The app needs no code change. Then check the redirect
    allow-list (`https://nevout-meds-liberia-pilot.vercel.app/**`) and verify signup, invite and
    reset with a real mailbox (`docs/STAFF_AUTH_ARCHITECTURE.md`).
  - **(b) The pilot provisioning fallback** (built and tested):
    - the operator verifies the owner out of band, then runs `ops/provision/provision-owner.mjs`;
    - the owner sets their own password from a single-use link.
    - Email confirmation **stays on**.
    - **Limitation:** there's no self-service password reset for active accounts until (a).

  Turning off "Confirm email" globally is **not** the chosen approach.

- [ ] **5. Support contacts.** A WhatsApp number and a support mailbox that someone reads.
  - Set them as `VITE_SUPPORT_WHATSAPP` / `VITE_SUPPORT_EMAIL` in Vercel, then redeploy.
  - Until then, Help → WhatsApp support opens without a recipient, and **no email contact
    is shown** (the app never publishes an unconfirmed address).

**Onboarding the first pharmacy** follows the pilot pack: [docs/pilot/README.md](docs/pilot/README.md),
starting with [PILOT_LAUNCH_MASTER_CHECKLIST.md](docs/pilot/PILOT_LAUNCH_MASTER_CHECKLIST.md).

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
