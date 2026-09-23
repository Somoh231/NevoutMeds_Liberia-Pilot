# NevOut Meds

Pharmacy operations for small pharmacies: sales, stock, customers, reminders, suppliers and
purchase orders. It keeps working offline, and keeps each pharmacy's data separate.

Status: **controlled Liberia pilot.** See [BUILD_COMPLETION_REPORT.md](BUILD_COMPLETION_REPORT.md)
and [PILOT_GO_LIVE_CHECKLIST.md](PILOT_GO_LIVE_CHECKLIST.md).

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, installable PWA (`client/`) on Vercel |
| Backend | Supabase: Postgres 17 with row-level security, security-definer RPCs, Auth, Storage, Realtime, and the `staff-admin` Edge Function (`supabase/`) |
| Operations | Independent backups, restore, monitoring and pilot provisioning (`ops/`) |

## Local development

Requirements: Node 20+, Docker, the Supabase CLI.

```bash
npm install
supabase start                      # local stack: API :55421, DB :55422, Studio :55423, mail :55424
cp .env.example .env.local          # then set VITE_SUPABASE_URL=http://127.0.0.1:55421 and the local anon key (`supabase status`)
npm run dev                         # http://localhost:5173
```

Local email (confirmation, reset) goes to the local mail catcher at http://127.0.0.1:55424.

**Never put a service-role key in any `VITE_*` variable or in browser code.**

## Tests

All tests use synthetic data on the **local** stack.

| Suite | How to run |
|---|---|
| Database: RLS, correctness, staff, offline, country, ops | `bash supabase/tests/run_local_validation.sh`. Builds a fresh database from the migrations. |
| Country config unit tests | `node supabase/tests/country_config.test.mjs` |
| Design tokens | `node supabase/tests/design_tokens.test.mjs` |
| Typecheck and build | `npm run build` |
| Browser end-to-end (`ui_*.e2e.mjs`, `api_*.e2e.mjs`) | Seed with `bash supabase/tests/seed_e2e.sh`. Serve a build that points at the local stack. Run each suite with `APP_BASE`, `NEVOUT_API_URL` and `CHROME` (headless Chromium) set. |

Test seeders refuse the production project. **Production is never seeded** (see
[STAGING_SETUP.md](STAGING_SETUP.md)).

## Documentation

| Topic | Document |
|---|---|
| Deploying and verifying production | [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) |
| Staging environment | [STAGING_SETUP.md](STAGING_SETUP.md) |
| Backup and restore | [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md), [ops/README.md](ops/README.md) |
| Monitoring and alerts | [docs/MONITORING.md](docs/MONITORING.md) |
| Incidents | [docs/PILOT_INCIDENT_RUNBOOK.md](docs/PILOT_INCIDENT_RUNBOOK.md) |
| Day-to-day pilot operation | [docs/PILOT_OPERATOR_GUIDE.md](docs/PILOT_OPERATOR_GUIDE.md) |
| Staff, auth, SMTP status, provisioning fallback | [docs/STAFF_AUTH_ARCHITECTURE.md](docs/STAFF_AUTH_ARCHITECTURE.md) |
| Offline and sync | [docs/OFFLINE_ARCHITECTURE.md](docs/OFFLINE_ARCHITECTURE.md) |
| Countries, currency, timezones | [docs/country/README.md](docs/country/README.md) |
| Dependencies and advisories | [docs/DEPENDENCY_SECURITY.md](docs/DEPENDENCY_SECURITY.md) |
| Design system | [docs/design-system/](docs/design-system/) |
