# Production deployment

## Current production (as of this document's commit)

| Component | Value |
|---|---|
| Frontend | `https://nevout-meds-liberia-pilot.vercel.app`: Vercel project `nevout-meds-liberia-pilot`, team `somoh231s-projects`. Also served at the `-somoh231s-projects.vercel.app` alias. |
| Backend | Supabase `qohpyeqyveusnxhnbtxz` (West EU / Ireland), organisation "NevOut Meds" |
| Database | Migrations `0001`–`0019` (see the build-completion report for the verified list) |
| Edge Function | `staff-admin` |
| Storage | `documents` bucket: private, 25 MiB limit, 6 MIME types, tenant-prefixed policies (0013) |
| Realtime | Publication `supabase_realtime` on the 7 operational tables (0017) |
| Data | **No tenant data.** Synthetic test data was removed 2026-09-23. Production must stay free of synthetic data (`STAGING_SETUP.md`). |

## Configuration (values held by the owner; never committed)

| Where | Name | Notes |
|---|---|---|
| Vercel → Production env | `VITE_SUPABASE_URL` | `https://qohpyeqyveusnxhnbtxz.supabase.co` |
| Vercel → Production env | `VITE_SUPABASE_ANON_KEY` | The public anon key, protected by RLS |
| Vercel → Production env | `VITE_SUPPORT_WHATSAPP`, `VITE_SUPPORT_EMAIL` | **TBD.** These are the public support contacts behind Help → WhatsApp / Email support. When unset, WhatsApp opens without a recipient, and email goes to `support@nevoutmeds.com`, which must be confirmed to exist. |
| Vercel → Production env | `NODE_VERSION` | Build runtime |
| Vercel | **Not set:** `VITE_DEMO_MODE`, and any service-role key | A build without Supabase config fails closed |
| Supabase → Edge Function secrets | `NEVOUT_APP_ORIGIN` | `https://nevout-meds-liberia-pilot.vercel.app` (verified by digest) |
| Supabase → Edge Function secrets | `NEVOUT_ALLOWED_APP_ORIGINS` | `https://nevout-meds-liberia-pilot.vercel.app,http://localhost:5173` (verified by digest) |
| Supabase → Auth → URL configuration | Site URL | `https://nevout-meds-liberia-pilot.vercel.app` |
| Supabase → Auth → URL configuration | Redirect allow-list | Should include `https://nevout-meds-liberia-pilot.vercel.app/**` (see `STAFF_AUTH_ARCHITECTURE.md`) |
| Supabase → Auth | Confirm email | **On** |
| Supabase → Auth → SMTP | — | **OPEN / TBD** |
| Supabase plan / backups | Managed backups, PITR | **Deferred** until the pilot or paid customers. The independent backup is in `docs/BACKUP_AND_RECOVERY.md`. |
| Operator machine / backup host | `ops/backup/backup.env` (chmod 600) | Backup passphrase, DB URL file, service-role key file, destination (**TBD**) |

## Deploying a change

Order: **staging first** (`STAGING_SETUP.md`), then production. Within an environment: database →
Edge Function → frontend.

```bash
# 1. Database (additive migrations only; never edit an applied one)
supabase link --project-ref qohpyeqyveusnxhnbtxz
supabase migration list --linked                 # confirm only the new migration(s) are pending
ops/backup/backup-db.sh                          # backup first (independent logical backup)
supabase db push --linked --dry-run
supabase db push --linked

# 2. Edge Function (only if supabase/functions changed)
supabase functions deploy staff-admin --project-ref qohpyeqyveusnxhnbtxz

# 3. Frontend (from a clean, committed tree)
npm run build                                    # typecheck + build locally first
vercel deploy --prod --yes                       # builds on Vercel with the Production env vars
```

## Verifying a deployment (read-only; never seeds data)

```bash
node supabase/tests/prod_smoke.e2e.mjs           # signed-out: reachability, routes, PWA, SW, no Demo Mode
node ops/monitor/health-check.mjs                # site, API, Edge Function, ops_health
```

Then check:
- **The bundle** is the one you built: the `index-*.js` hash on `/` matches `dist/`.
- **Only the public anon key is embedded:** a scan finds no service-role JWT and no `sb_secret_`.
- **The schema** equals the tested build: the `ops/backup/sql/manifest.sql` fingerprint matches
  a fresh local build from the migrations.

## Rollback

| Layer | How |
|---|---|
| Frontend | Vercel → Deployments → promote the previous production deployment. Or `vercel rollback`. |
| Database | Migrations are additive. Roll forward with a corrective migration. For destructive incidents, restore from the independent backup (`docs/BACKUP_AND_RECOVERY.md` §5). |
| Edge Function | Redeploy the previous commit's `supabase/functions/staff-admin`. |
| Recovery tags | `pre-phase8-hardened`, `post-phase9-multicountry` |
