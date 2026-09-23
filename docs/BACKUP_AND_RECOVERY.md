# NevOut Meds: backup and recovery

**Status (2026-09-23): OPEN — GO-LIVE BLOCKER.** The production project has **no platform
backups**. A logical dump-and-restore was rehearsed and works (measured below), but nothing takes
dumps on a schedule, so the RPO for production today is **unbounded**.

---

## 1. Verified platform backup state (`qohpyeqyveusnxhnbtxz`)

From `supabase backups list --project-ref qohpyeqyveusnxhnbtxz`, run 2026-09-23:

| Region | WAL-G | PITR | Earliest backup | Latest backup |
|---|---|---|---|---|
| West EU (Ireland) | true | **false** | **none (0)** | **none (0)** |

- **Physical backups available: none.** Point-in-time recovery: **off**.
- The billing plan can't be read through the CLI. Check it in the dashboard (**Organization →
  Billing**). This state matches the Free plan, which provides no downloadable backups and no PITR.
  A Free project can also be **paused after about a week of inactivity**, which would take a pilot
  pharmacy offline without warning.

**Conclusion:** the platform provides no backup to rely on. Before real pharmacy data is entered,
at least one of these must be true:

1. **The project is on Pro or higher** (daily backups, 7-day retention, self-serve restore; PITR
   as an add-on), **or**
2. **Scheduled logical dumps are running** (section 3), stored encrypted off the machine that takes
   them, with a named owner who checks them.

The recommended posture is both: Pro for platform backups, plus a nightly logical dump as an
independent copy.

## 2. What must be backed up

| Data | Covered by a DB dump | Notes |
|---|---|---|
| Business data (`public`) | ✅ | pharmacies, sales, inventory, movements, customers, audit logs |
| Private registry (`private`) | ✅ | but it's seeded by migration 0018; exclude it on restore (section 4) |
| Auth users (`auth`) | ✅ with `--schema auth` | password hashes; users don't need recreating |
| **Storage objects** (`documents` bucket) | ❌ | **not in database dumps.** Currently 4 synthetic files, 52 bytes. |
| Edge Function code | ❌ | lives in this repository (`supabase/functions/staff-admin`) |
| Secrets and auth configuration | ❌ | names in `docs/PRODUCTION_DEPLOYMENT_INVENTORY.md`; values are held by the owner |

A complete recovery needs all of: a database dump, a storage copy, this repository, and the
configuration inventory.

## 3. Independent logical backup (works on any plan)

Run from a trusted machine, never from a pharmacy device:

```bash
supabase db dump --linked -f schema_$(date +%F).sql
supabase db dump --linked --data-only --schema public,private,auth -f data_$(date +%F).sql
chmod 600 schema_*.sql data_*.sql
```

Encrypt the files and move them off the machine. They contain customer names and phone numbers.
For storage, copy the `documents` bucket with the Storage API (server-side, service role). There
is no single CLI command for this today.

**Nothing schedules this yet.** Until a scheduled job exists and has an owner, the production RPO
is unbounded.

## 4. Restore rehearsal: done 2026-09-23 (synthetic data)

| Step | What was done | Measured |
|---|---|---|
| Schema dump of production | `supabase db dump --linked` | **46 s** (163 KB), including CLI start-up |
| Data dump of production | `supabase db dump --linked --data-only --schema public,private,auth` | **53 s** (218 KB) |
| Rebuild the schema in a fresh database | Supabase auth baseline, then migrations `0001`→`0018` in order | **1.7 s** |
| Load the data | `psql -f data.sql`, with the `private.country_rules` block excluded | **0.1 s** |
| **Fidelity** | Row counts, dump vs. restored, **19 tables** (public, private, auth) | **19 / 19 exact, 0 mismatches** |
| **Function** | Simulated owner session on the restored DB: sees only their pharmacy (1), no foreign sales (0), `financial_summary` = USD / Africa/Monrovia, a sale recorded, stock 200 → 199 | ✅ |

**Where it ran:** the target was a **fresh local Postgres** (the project's local Supabase
container), not a new Supabase project. Creating a second hosted project needs an account
decision, so it wasn't done.

**What this proves:**
- The dump is complete for the database.
- The migrations rebuild the schema from nothing.
- The data loads with exact fidelity.
- Isolation and the RPCs work on the restored copy.

**What it does not measure:**
- Provisioning a new Supabase project.
- Re-applying auth settings and secrets.
- Redeploying `staff-admin`.
- Repointing and redeploying the frontend.
- Copying storage.

These are manual steps, estimated at an hour or two but **not measured**.

### Measured values

| Measure | Value | Basis |
|---|---|---|
| **RPO (production, today)** | **Unbounded** | No platform backups, and no scheduled dump |
| RPO with a nightly dump | ≤ 24 h (design value, not measured) | Would need the schedule to exist and be verified |
| **Database dump + restore time (this data size)** | **≈ 1 min 41 s** (46 s + 53 s + 1.8 s) | Measured |
| **Full-environment RTO** | **Not measured** | Needs a rehearsal into a new hosted project |

Don't quote an RPO or RTO to a pharmacy until the posture in section 1 is in place and a
full-environment restore has been timed.

## 5. Restore procedure (as rehearsed)

1. Create a **new** Supabase project. Never restore over a live project while diagnosing.
2. `supabase link` to it, then run `supabase db push`, which applies `0001`→`0018`.
3. Load the data. Remove the `private.country_rules` insert first, because migration 0018 already
   seeded it:
   `psql "$NEW_DB_URL" -f data_<date>.sql`
4. Verify the row counts against the dump, table by table.
5. Re-upload storage objects into `documents`, keeping the `<pharmacy_id>/` prefixes.
6. Re-apply the auth settings (Site URL, redirect allow-list, SMTP) and the Edge Function secrets
   (`NEVOUT_APP_ORIGIN`, `NEVOUT_ALLOWED_APP_ORIGINS`).
7. Run `supabase functions deploy staff-admin`.
8. Set the Vercel env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and redeploy.
9. Run `supabase/tests/prod_smoke.e2e.mjs`, sign in as an owner, record a sale, and confirm stock
   moves. Check that another tenant's data is not visible.

## 6. A genuine mitigation already in the product

- **Outages:** every device keeps an IndexedDB cache and a durable mutation queue, so a
  **backend outage is not immediate data loss**. Pharmacies keep selling offline and their work
  syncs exactly once when the service returns (verified by the offline suites).
- **Data loss:** this does **not** protect against destructive loss on the server. Only backups do
  that.

## 7. Open items before the first real pharmacy

- [ ] **Decide the plan**: upgrade `qohpyeqyveusnxhnbtxz` to Pro (recommended) and confirm daily
      backups appear in `supabase backups list`.
- [ ] **Schedule the logical dump** (nightly), store it encrypted off-machine, and name an owner.
- [ ] Choose and document the storage backup method for the `documents` bucket.
- [ ] Rehearse a **full-environment** restore into a new hosted project and record the actual RTO.
- [ ] Name the backup owner in `docs/PILOT_INCIDENT_RUNBOOK.md`.
