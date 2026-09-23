# Staging environment setup

**Status: designed, not created.** A new Supabase project (and possibly a Vercel environment) may
incur cost, so it needs the owner's approval. Nothing has been created.

## Why

Production (`qohpyeqyveusnxhnbtxz`) was cleaned of all synthetic data on 2026-09-23 and **must stay
clean**. The end-to-end suites create synthetic users, pharmacies and sales, so they need their own
backend with:

- **the same migrations** as production (`supabase/migrations/0001`–`0019`);
- **the same Edge Function** (`staff-admin`) and the same kinds of secrets;
- **its own Auth users, Storage and data**: synthetic only, and never real people;
- **its own backups**: the independent backup tooling can target it too, which makes it the
  natural place for full-environment restore rehearsals.

The scripts enforce this:
- `seed_remote.mjs` and `ui_country_pilots.e2e.mjs` **refuse the production project ref** unless
  `NEVOUT_ALLOW_PRODUCTION_SEED=1` is set, which shouldn't happen.
- `prod_smoke.e2e.mjs` runs only signed-out checks against production unless a dedicated smoke
  account is supplied.

## 1. Create the Supabase project (owner approval required)

1. Supabase dashboard → New project in the **NevOut Meds** organisation.
   - **Name:** `nevoutmeds-staging`
   - **Region:** West EU (Ireland), the same as production
   - **Plan:** free if the organisation's free-project allowance permits; otherwise decide on cost.
2. Record the new project ref. Below, it's `<STAGING_REF>`.

## 2. Database, function and secrets

```bash
supabase link --project-ref <STAGING_REF>
supabase db push                                   # applies 0001 … 0019, exactly as production
supabase functions deploy staff-admin --project-ref <STAGING_REF>
supabase secrets set --project-ref <STAGING_REF> \
  NEVOUT_APP_ORIGIN=https://<staging-frontend-host> \
  NEVOUT_ALLOWED_APP_ORIGINS=https://<staging-frontend-host>,http://localhost:5173
supabase link --project-ref qohpyeqyveusnxhnbtxz   # re-link production afterwards
```

**Verify:** `supabase migration list --linked` shows 0001–0019. Running the schema fingerprint
from `ops/backup/sql/manifest.sql` on both projects should give an identical `fingerprint` block.

## 3. Auth (dashboard → Authentication)

| Setting | Staging value |
|---|---|
| Site URL | `https://<staging-frontend-host>` |
| Redirect allow-list | `https://<staging-frontend-host>/**`, `http://localhost:5173/**`, `http://127.0.0.1:5173/**` |
| Confirm email | **On**, the same as production, so signup/invite flows are tested for real |
| SMTP | Same provider as production, or a test inbox such as a provider sandbox. Never send staging mail to real people. |
| Minimum password length | 8 |

## 4. Frontend

Choose one:
- **Recommended:** a Vercel **Preview** environment for the staging backend. In Vercel → Project →
  Settings → Environment Variables, scope these to **Preview** only:
  - `VITE_SUPABASE_URL = https://<STAGING_REF>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY = <staging anon key>`

  Every pushed branch then deploys against staging. Production env vars stay scoped to
  **Production**.
- **Local only:** `VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run build && npx vite preview`.

Never set `VITE_DEMO_MODE`. Never put a service-role key in any `VITE_*` variable.

## 5. Keys on the test machine (never committed)

```bash
install -m 600 /dev/null ~/.nevout-staging/anon.key          # paste the staging anon key
install -m 600 /dev/null ~/.nevout-staging/service.key       # paste the staging service-role key
export NEVOUT_API_URL=https://<STAGING_REF>.supabase.co
export NEVOUT_ANON_FILE=~/.nevout-staging/anon.key
export NEVOUT_SERVICE_FILE=~/.nevout-staging/service.key
export APP_BASE=https://<staging-frontend-host>              # or a local preview built for staging
export NEVOUT_ALLOW_REMOTE_SYNTHETIC=1                       # the pilots may seed staging
export CHROME=<path to chrome-headless-shell>
```

## 6. Running the suites against staging

```bash
node supabase/tests/seed_remote.mjs                 # synthetic tenants (refuses production)
for t in ui_phase8_correctness ui_core_flows ui_workflows ui_foundation ui_offline_first \
         ui_offline_sale_stock ui_staff_lifecycle ui_recovery api_tenant_isolation \
         api_staff_lifecycle api_realtime_offline ui_country_pilots; do
  node supabase/tests/seed_remote.mjs >/dev/null && UDD=$(mktemp -d) OUT=$(mktemp -d) node supabase/tests/$t.e2e.mjs
done
PROD_URL=https://<staging-frontend-host> NEVOUT_SMOKE_USE_E2E=1 node supabase/tests/prod_smoke.e2e.mjs
```

**Against production, only this:**

```bash
node supabase/tests/prod_smoke.e2e.mjs      # signed-out checks only, unless a dedicated smoke account is supplied
node ops/monitor/health-check.mjs           # read-only
```

## 7. Staging backups and restore rehearsal

- Use a separate `backup.env` with `NEVOUT_BACKUP_PROJECT=staging` and a separate passphrase.
- Staging is where a **full-environment restore** can be rehearsed and timed (`docs/BACKUP_AND_RECOVERY.md` §5):
  1. a new project;
  2. `restore-db.sh`;
  3. `restore-storage.sh`;
  4. reconfigure;
  5. point a preview frontend at it;
  6. `health-check.mjs`.

## 8. Rules

1. **Synthetic data only.** No real pharmacies, patients or staff, ever.
2. Migrations reach staging **first**, then production (`supabase db push` against each).
3. Staging keys are not production keys. Store them separately.
4. Delete staging data freely. Never "fix" production by copying from staging.
