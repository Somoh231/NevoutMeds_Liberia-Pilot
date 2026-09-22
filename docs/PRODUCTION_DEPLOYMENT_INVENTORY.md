# NevOut Meds — Production deployment inventory

Target project: **`qohpyeqyveusnxhnbtxz`** (`https://qohpyeqyveusnxhnbtxz.supabase.co`)
Status: **nothing has been deployed.** This is the exact checklist for when you approve the rollout.

Order matters: database → auth → storage → realtime → edge function → frontend.

---

## 1. Database

| Item | Value | Command / place |
|---|---|---|
| Migrations | **17 files**, `0001` → `0017` | `supabase db push` (linked project) |
| Tables | 20, **all with RLS enabled** | verified by the test suite |
| Functions in `public` | 31 | created by migrations |
| Private helper schema | `private` (not API-exposed) | created by `0011` |
| Check constraints | 10 (non-negative stock/prices, payment-method allow-list, …) | `0011` |
| Composite tenant FKs | 13 | `0011` |
| Idempotency receipts | `mutation_receipts` | `0017` |

**Before pushing:** take a snapshot of the remote project if it holds anything (it should be empty).
**After pushing:** run `supabase/tests/run_local_validation.sh` logic against a staging copy if one
exists — do **not** run the destructive test suites against production.

Post-push verification (read-only, safe):
```sql
select count(*) from pg_tables where schemaname='public';                 -- 20
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;    -- 0
select count(*) from pg_proc p where p.pronamespace='public'::regnamespace
  and has_function_privilege('anon', p.oid, 'execute');                   -- 0
select string_agg(tablename, ',') from pg_publication_tables
  where pubname='supabase_realtime';                                      -- 7 operational tables
```

## 2. Auth

| Setting | Local value | Production value to set |
|---|---|---|
| Site URL | `http://127.0.0.1:5173` | **the real domain** (e.g. `https://app.nevoutmeds.com`) |
| Redirect allow-list | localhost entries | production domain + Vercel preview pattern |
| Password reset URL | `${origin}/reset-password` (from the app) | works automatically once Site URL is right |
| Invitation URL | `${origin}/accept-invite?token=…` (from the Edge Function) | governed by `NEVOUT_ALLOWED_APP_ORIGINS` |
| Email confirmations | **disabled** locally | **enable** for production sign-ups |
| Minimum password length | 6 | raise to **8+** |
| JWT expiry | 3600 s | keep 3600 s |
| SMTP | Inbucket (local only) | **must be configured** — see blockers |

## 3. Storage

| Item | Value |
|---|---|
| Bucket | `documents`, **private** |
| Size limit | 25 MiB (26214400 bytes) |
| Allowed MIME types | 6: PDF, PNG, JPEG, WebP, DOCX, XLSX |
| Policies | 4 on `storage.objects`, scoped to `<pharmacy_id>/` prefix; owner/admin write |
| Created by | migration `0013` (skips automatically if the storage schema is absent) |

## 4. Realtime

Publication `supabase_realtime` must contain exactly: `inventory, products, purchases, customers,
reminders, purchase_orders, users_profiles` — all with `REPLICA IDENTITY FULL`. Created by `0017`.

**Operational note learned locally:** the Realtime service must be restarted after tables are added
to the publication, and it is the component most likely to be OOM-killed under memory pressure. The
app tolerates its absence (REST keeps working, and it reconciles on reconnect), but alert on it.

## 5. Edge Function `staff-admin`

```bash
supabase functions deploy staff-admin --project-ref qohpyeqyveusnxhnbtxz
```

| Secret | Purpose | Notes |
|---|---|---|
| `SUPABASE_URL` | project URL | provided by the platform |
| `SUPABASE_ANON_KEY` | acts as the caller | provided by the platform |
| `SUPABASE_SERVICE_ROLE_KEY` | invite emails, ban/unban | **server-side only — never a `VITE_` variable** |
| `NEVOUT_ALLOWED_APP_ORIGINS` | redirect allow-list for invitation links | comma-separated; production domain (+ preview domain if invitations are tested there) |
| `NEVOUT_APP_ORIGIN` | default origin for links | production domain |

## 6. Frontend (Vercel)

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://qohpyeqyveusnxhnbtxz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's anon/publishable key (browser-safe by design) |
| `VITE_DEMO_MODE` | **must not be set** in production (`true` would bypass authentication) |

* `vercel.json` already rewrites all routes to `/index.html` (SPA routing verified).
* Preview deployments: either give them their own Supabase project, or accept that they share
  production data — do not point previews at production without deciding this deliberately.
* After deploying, verify: `/`, `/login`, `/platform`, `/onboarding`, `/import`, `/admin`,
  `/accept-invite`, `/forgot-password`, `/reset-password`, plus service-worker registration.

## 7. Secret hygiene (verified locally)

* No `service_role` reference exists anywhere in `client/src` or in the built bundle — checked by grep
  against the compiled output.
* `.env.local` holds only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and is git-ignored.
* The only place a service-role key exists is the Edge Function's environment.

## 8. Rollout order

1. `supabase db push` (17 migrations)
2. Verify with the read-only queries in §1
3. Configure Auth (Site URL, redirects, confirmations, password length, **SMTP**)
4. Confirm the `documents` bucket and its policies exist
5. Confirm the realtime publication, then restart Realtime
6. Deploy `staff-admin` with its secrets
7. Set Vercel env vars and deploy
8. Create the first owner account, complete onboarding, invite one staff member end-to-end
9. Record the first backup and test a restore (see the backup document)
