# Pilot go-live checklist: first real Liberia pharmacy

This lists only what **people** still have to do before the first real pharmacy is onboarded.
Everything the software needs is deployed and verified; see
[FINAL_PILOT_READINESS_REPORT.md](FINAL_PILOT_READINESS_REPORT.md).

Tick every **BLOCKER** before onboarding. The others should be done before or during week one.

## Blockers

- [ ] **1. Let new people create accounts.** *(Supabase dashboard → Authentication)*
  - **The problem:** production requires email confirmation, but no email can be sent.
  - **Evidence:** a synthetic signup on 2026-09-23 returned **429 `over_email_send_rate_limit`**.
  - **The impact:** a new pharmacy owner **cannot sign up**, and an invited staff member **cannot
    create their account** from the WhatsApp link.
  - **Do one of:**
    - **(a) Configure production SMTP** (Authentication → Emails → SMTP settings: host, port,
      user, API key/password, verified sender domain). This is recommended, and it also makes
      password reset work.
    - **(b) Turn off "Confirm email"** for the pilot (Authentication → Sign In / Providers → Email).
      The invitation token, validated server-side, remains the real authorization gate. Password
      reset then stays **unavailable** until (a) is done.
  - **Afterwards,** tell the engineer so the real signup → invite → accept path can be verified on
    production.

- [ ] **2. Put a backup posture in place.** *(Supabase dashboard → Organization → Billing, plus an
  owner)*
  - **Verified 2026-09-23:** `supabase backups list` shows **no backups** and **PITR off**.
  - **Do:** upgrade `qohpyeqyveusnxhnbtxz` to **Pro** (daily backups, 7-day retention), and/or
    approve a **scheduled nightly logical dump** stored encrypted off-machine
    (`docs/BACKUP_AND_RECOVERY.md` §3).
  - **Then:** confirm that a backup appears in `supabase backups list`.

- [ ] **3. Name the owners** in `docs/PILOT_INCIDENT_RUNBOOK.md`: an **incident owner** and a
  **backup owner**, with phone and WhatsApp. They can't be blank.

- [ ] **4. Remove the synthetic test accounts from production.**
  - **Why:** the GitHub repository is **public** and contains the test password. Production still
    has `@e2e.local` accounts that use it, confined by RLS to synthetic pharmacies. Remove them
    before real data arrives.
  - **Remove:**
    - the `@e2e.local` users (Authentication → Users);
    - the synthetic pharmacies ("E2E Pharmacy A/B", "Pilot Pharmacy Accra/Nairobi/Kigali") and
      their data;
    - or ask the engineer to run a scripted cleanup.
  - **Afterwards:** from then on, only run end-to-end tests against production with a **fresh
    random password** (`NEVOUT_TEST_PASSWORD`), or against a separate staging project.

## Before or during week one

- [ ] **5. Full-environment restore rehearsal.** A logical restore was rehearsed locally (19/19
  tables exact, about 1 min 41 s). Once the plan decision (item 2) is made, authorize a restore into
  a **new hosted project** so the real end-to-end RTO can be measured.
- [ ] **6. Storage backup method** for the `documents` bucket: choose one and write it into the
  backup doc. Database dumps don't include files.
- [ ] **7. Pilot agreement covers personal data.**
  - Confirm the agreement with the pharmacy covers storing customer names, phone numbers and
    purchase history (research backlog X8).
  - Tell pharmacies not to record diagnoses or other sensitive health data in free-text notes.
- [ ] **8. Decide whether owner self-signup stays open.** Today anyone can create an account and a
  new pharmacy (isolated by RLS). For a *controlled* pilot you may prefer to onboard pharmacies
  yourself and then restrict signups.
- [ ] **9. Brief the pilot pharmacy:**
  - money shows as **US$** (not L$), and one sale is one currency;
  - "today" follows Liberia time;
  - how offline mode and the sync badge work;
  - password reset needs SMTP (item 1a);
  - who to call (item 3).
- [ ] **10. Re-authenticate the Supabase CLI with the NevOut account.** It returned **403** again
  at the end of this work. Run `supabase login` so that the cleanup (item 4) and the backup
  checks (item 2) can be run and verified. Update the CLI too (v2.98.2 is installed; v2.117 is
  available).

## Already done (no action needed)

- Migration 0018 applied to production and verified; the schema matches the tested build exactly.
- Frontend deployed to `https://nevout-meds-liberia-pilot.vercel.app`; production smoke 25/25.
- Edge Function origins set to the canonical URL (verified by digest).
- Branch pushed; recovery tags `pre-phase8-hardened` and `post-phase9-multicountry`.
