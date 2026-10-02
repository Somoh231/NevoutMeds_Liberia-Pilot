# Production deployment

## Current production (as of this document's commit)

| Component | Value |
|---|---|
| Frontend | `https://nevout-meds-liberia-pilot.vercel.app`: Vercel project `nevout-meds-liberia-pilot`, team `somoh231s-projects`. Also served at the `-somoh231s-projects.vercel.app` alias. |
| Backend | Supabase `qohpyeqyveusnxhnbtxz` (West EU / Ireland), organisation "NevOut Meds" |
| Database | Migrations `0001`–`0020` (`0020` = capabilities + MFA assurance, applied 2026-09-25; see the Phase 11 report) |
| Edge Function | `staff-admin` (v4, adds the owner `reset_mfa` action) |
| Storage | `documents` bucket: private, 25 MiB limit, 6 MIME types, tenant-prefixed policies (0013) |
| Realtime | Publication `supabase_realtime` on the 7 operational tables (0017) |
| Data | **No tenant data.** Synthetic test data was removed 2026-09-23. Production must stay free of synthetic data (`STAGING_SETUP.md`). |

## Configuration (values held by the owner; never committed)

| Where | Name | Notes |
|---|---|---|
| Vercel → Production env | `VITE_SUPABASE_URL` | `https://qohpyeqyveusnxhnbtxz.supabase.co` |
| Vercel → Production env | `VITE_SUPABASE_ANON_KEY` | The public anon key, protected by RLS |
| Vercel → Production env | `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_WHATSAPP` | The public support contacts behind Help → Email / WhatsApp support. `VITE_SUPPORT_EMAIL=support@nevoutmeds.com` is **set** (verified in production on 2026-10-02). `VITE_SUPPORT_WHATSAPP` is **TBD**; while it is unset, WhatsApp opens without a recipient. There is no fallback address. |
| Vercel → Production env | `VITE_SENTRY_DSN` | **Public.** Turns on code-level error monitoring (Phase 11). Unset = monitoring off. See `docs/observability/SENTRY_PRIVACY_POLICY.md`. |
| Vercel → Production env | `VITE_SENTRY_ENVIRONMENT` | Optional; defaults to `production` |
| Vercel → Production env (**build only**) | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | **Token is secret; never `VITE_*`.** Only for source-map upload; maps are deleted from the output after upload. |
| Vercel → Production env | `NODE_VERSION` | Build runtime |
| Vercel | **Not set:** `VITE_DEMO_MODE`, and any service-role key | A build without Supabase config fails closed |
| Supabase → Edge Function secrets | `NEVOUT_APP_ORIGIN` | `https://nevoutmeds.com` (set 2026-10-02, verified by digest). The fallback origin for invitation links. |
| Supabase → Edge Function secrets | `NEVOUT_ALLOWED_APP_ORIGINS` | `https://nevoutmeds.com,https://nevout-meds-liberia-pilot.vercel.app,http://localhost:5173` (set 2026-10-02, verified by digest). This one list is both the **CORS allow-list** of `staff-admin` (exact origins are echoed; never `*`; any other browser origin gets 403) and the set of origins invitation links may use. The Vercel URL stays on it **temporarily**; remove it when that URL is retired. |
| Supabase → Auth → URL configuration | Site URL | `https://nevoutmeds.com` (observed 2026-10-02: unknown redirect targets fall back to it) |
| Supabase → Auth → URL configuration | Redirect allow-list | Accepts `https://nevoutmeds.com/…` and, temporarily, `https://nevout-meds-liberia-pilot.vercel.app/…`; rejects other hosts (probed read-only on 2026-10-02 with an invalid `/verify` token). See `STAFF_AUTH_ARCHITECTURE.md`. |
| Supabase → Auth | Confirm email | **On** |
| Supabase → Auth → Multi-Factor | App Authenticator (TOTP) | **Enabled** (hosted default). Owners and admins cannot reach any data without it (migration 0020). Verify before go-live. |
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

## Canonical domain `https://nevoutmeds.com` (2026-10-02)

**Domains.** `https://nevoutmeds.com` serves the same production deployment as the Vercel URL.
`www.nevoutmeds.com` redirects to the apex domain with a 308, so it is not an app origin.

**Browser-origin allow-lists:**

| Where | Allowed |
|---|---|
| `staff-admin` CORS, and invitation-link targets (`NEVOUT_ALLOWED_APP_ORIGINS`) | `https://nevoutmeds.com`, `https://nevout-meds-liberia-pilot.vercel.app` (temporary), `http://localhost:5173` |
| `staff-admin` local default (no secret set) | `http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:4173`, `http://127.0.0.1:4178`, `http://127.0.0.1:4180` |
| Supabase Auth redirects | `nevoutmeds.com` (Site URL) and the Vercel URL. Set in the dashboard; not changed by this deployment. |
| Supabase REST / Auth / Storage APIs | Platform-managed CORS. There is no allow-list in this repository; access is governed by the API key and RLS. |

`NEVOUT_APP_ORIGIN` was switched to `https://nevoutmeds.com` at the release closeout. It is only
the fallback for invitation links when a request names no allowed origin; the browser always
sends its own.

**What hosted Supabase adds in front of the function.** With `verify_jwt` on, the platform rejects
a missing or malformed bearer token (`401 UNAUTHORIZED_…`) before the function runs. That
platform response carries its own `Access-Control-Allow-Origin: *` and no data. Every response
the function itself produces echoes only allow-listed origins.

**Check:**

```bash
NEVOUT_API_URL=https://qohpyeqyveusnxhnbtxz.supabase.co NEVOUT_ANON_KEY_FILE=<anon key file> \
NEVOUT_ALLOWED_ORIGINS="https://nevoutmeds.com,https://nevout-meds-liberia-pilot.vercel.app,http://localhost:5173" \
  node supabase/tests/api_cors_origins.e2e.mjs
```
