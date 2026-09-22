# NevOut Meds — Phase 1 Hardening Report

Date: 2026-09-22
Authoritative backend: Supabase project `qohpyeqyveusnxhnbtxz` (linked; **nothing pushed to cloud**)
Scope: complete the Phase 1 validation that Codex started. No UI redesign, no new features.

## Gate status: **PASS WITH BLOCKERS**

The migration chain, build, PWA and SPA routing are validated with evidence. The
blockers below are security findings that Phase 2 has to fix, plus a local
Docker limitation that prevents API-level (HTTP) end-to-end tests against the
local stack.

---

## 1. Codex's uncommitted changes: reviewed and kept

| File | Change | Verdict |
|---|---|---|
| `0002_align_schema_profiles_purchase_items.sql` | Added `declare r record;` to the four `DO` blocks that loop over FK constraints | **Correct.** Without it, PL/pgSQL fails with "loop variable of loop over rows must be a record variable", and the migration cannot run on any database. |
| `0008_pilot_telemetry_admin_console.sql` | `app_feedback.user_id` changed from `not null … on delete set null` to nullable | **Correct.** The original contradicted itself: deleting a profile would violate NOT NULL. |
| `0010_admin_pilot_success_dashboard.sql` | `group by d` replaced with `group by purchased_at::date` | **Correct.** `d` is not a column of `purchases`, so the function failed to compile. |
| `supabase/config.toml` (new) | Local ports moved to the 5542x range, `project_id = NevOutMeds_Liberia_Pilot`, PG major 17 | **Correct.** Isolates this project from the other local Supabase stacks. PG 17 matches the linked project (`17.6.1.166`). |
| `client/index.html`, `client/src/main.tsx`, `vite.config.ts`, `package.json` | PWA wiring (`vite-plugin-pwa`, prompt-to-update registration) | **Correct.** Verified working (§4). |

Nothing was reverted.

## 2. Migration reproducibility: **PASS**

Codex's claim was not taken on trust. I re-ran the chain from scratch.

* `supabase db reset --local` recreated the local DB container, then hung for more than 20 min in the CLI's
  post-reset service health wait. The DB itself was healthy. See §6.
* So I built a repeatable harness that doesn't depend on the CLI:
  **`supabase/tests/run_local_validation.sh`**. Each run it:
  1. creates a brand-new database `nevout_verify` inside the local NevOut DB container;
  2. seeds it with the pristine Supabase `auth` schema, Supabase's `public` grants and default
     privileges, and `pgcrypto` in `extensions` (mirroring a hosted project);
  3. applies every file in `supabase/migrations` in order as `postgres`, with `ON_ERROR_STOP` and one
     transaction per file;
  4. runs every `supabase/tests/*.test.sql`.

Result on a fresh database, with no manual intervention:

```
PASS 0001_init.sql
PASS 0002_align_schema_profiles_purchase_items.sql
PASS 0003_customers_fields_and_record_purchase.sql
PASS 0004_suppliers_orders_reminders_fields.sql
PASS 0005_rls_tenant_isolation.sql
PASS 0006_onboarding_and_pharmacies_rls.sql
PASS 0007_unique_constraints_for_import.sql
PASS 0008_pilot_telemetry_admin_console.sql
PASS 0009_admin_usage_metrics.sql
PASS 0010_admin_pilot_success_dashboard.sql
```

### Resulting metadata (verified from the catalog)

* **Tables (17):** pharmacies, users_profiles, suppliers, supplier_catalogue, products, inventory,
  stock_movements, customers, purchases, purchase_items, documents, reminders, purchase_orders,
  purchase_order_items, app_events, app_feedback, app_logs.
* **RLS:** enabled on all 17; `pharmacies` has 1 policy (select only), `users_profiles` has 4, every other table has 2.
* **Foreign keys:** 35. Every tenant table references `pharmacies(id)`. The user FKs were re-pointed from
  `users` to `users_profiles` as intended.
* **Unique constraints:** `products(pharmacy_id,name)`, `inventory(pharmacy_id,product_id)`,
  `customers(pharmacy_id,phone)`.
* **Indexes:** 54, including a `pharmacy_id` index on every tenant table.
* **Functions (9):** `adjust_stock`, `record_purchase`, `onboard_new_pharmacy`, `admin_pilot_overview`,
  `admin_usage_snapshot`, `admin_pilot_success_dashboard` (SECURITY DEFINER, `search_path=public`);
  `current_profile`, `is_admin`, `same_pharmacy` (SECURITY INVOKER).
* **Triggers:** none.
* **CHECK constraints:** none. Negative stock, quantities and prices are all accepted.

### Security observations from the metadata (these are Phase 2 inputs)

1. **All six SECURITY DEFINER RPCs are executable by `anon`**: Supabase's default privileges grant
   EXECUTE on new `public` functions to `anon` and `authenticated`, and no migration revokes it.
2. The RLS helpers are SECURITY INVOKER and read `users_profiles` from inside `users_profiles` policies,
   so the policies recurse into themselves (the audit's recursion finding).
3. The `users_profiles_update` policy lets any user update their own row with no column restriction, so
   **staff can set their own `role` to `owner` or `admin`, or change their `pharmacy_id`**.
4. `record_purchase` and `adjust_stock` don't verify that the customer or product belongs to the caller's
   pharmacy, and don't validate quantity, price or payment method.
5. `anon` holds TRUNCATE on every table. RLS doesn't cover TRUNCATE; PostgREST doesn't expose it, but
   the grant should be revoked anyway.

## 3. Frontend build: **PASS**

`npm run build` (`tsc -b && vite build`) succeeds, with no type errors.

## 4. PWA: **PASS**

Verified in headless Chromium through the Chrome DevTools Protocol (script:
`pwa_check.mjs`, kept in the session scratchpad, not in the repo):

* `/manifest.webmanifest` returns 200 `application/manifest+json`: name, `start_url=/platform`,
  `scope=/`, and icons 192/512/maskable.
* `/sw.js` registers, reaches **`activated`**, and **controls** the page. The Workbox precache
  (`workbox-precache-v2`) is populated with 19 entries and the runtime `assets` cache is created.
* `/pwa/icon-192.png`, `/pwa/icon-512.png`, `/pwa/favicon-32.png` and `/pwa/apple-touch-icon.png` all return 200 `image/png`.
* No failed network requests (no 4xx/5xx) on any route, and no broken asset paths.
* Note: the Claude desktop in-app browser pane can't register service workers ("unknown error
  fetching the script" even though the script returns 200), so it wasn't used for this check.

## 5. SPA routes: **PASS**

The preview server (`vite preview`, port 4173) was checked in two builds:

| Route | Demo build (no env) | Configured build (env set) | Console errors |
|---|---|---|---|
| `/` | renders home | renders home | 0 |
| `/login` | **redirects to `/platform` as Demo Admin** (blocker B1) | renders login | 0 |
| `/platform` | renders | redirects to `/login` ✅ | 0 |
| `/onboarding` | renders | redirects to `/login` ✅ | 0 |
| `/import` | renders | redirects to `/login` ✅ | 0 |
| `/admin` | renders | redirects to `/login` ✅ | 0 |
| `/nope/deep/link` | fallback to `/` | fallback to `/` | 0 |

`vercel.json` rewrites `/(.*)` to `/index.html`. That's correct for SPA routing, and static
assets are still served first because Vercel checks the filesystem before rewrites.

## 6. Local infrastructure limitation (still present)

* The Docker Desktop VM has **7.7 GB RAM shared by about 7 local Supabase stacks** (NevOut, pathlift,
  Sunny_Side, Raccex, PathwayOs, Karkona, spendda). Most containers report *unhealthy* because their
  health checks time out.
* `supabase db reset --local` hung for more than 20 min after recreating the DB; I had to stop it.
* The **host port proxy times out** on 55422 (Postgres) and 55421 (Kong/API). `docker exec` into the DB
  container works reliably, so all DB validation runs through `docker exec`.
* Impact: HTTP-level end-to-end tests (browser → local Supabase API) aren't possible right now.
  DB-level RLS tests (switching to the `authenticated`/`anon` role with JWT claims, as PostgREST does)
  are unaffected.
* Fix (your call; I didn't stop other projects' containers): `supabase stop` in the projects you're not
  using, or raise the Docker Desktop memory limit.

## 7. Dependency security baseline

Before: 14 advisories (8 high). After targeted, **in-range, non-major** updates
(`react-router-dom` 6.30.3→6.30.6, `ws` 8.20→8.21.3, plus postcss, nanoid, brace-expansion,
browserslist, fast-uri, @babel/core, baseline-browser-mapping): **5 advisories (2 high)**.
`npm audit fix --force` was **not** run.

| Package | Sev | Runtime? | Classification | Action |
|---|---|---|---|---|
| **xlsx 0.18.5** (prototype pollution GHSA-4r6h-8v6p-xvw6; ReDoS GHSA-5pgg-2g8v-p4x9) | high | **Yes, runs in the browser on uploaded files** | **Exploitable** before mitigation: a crafted workbook, such as a "supplier price list", could pollute `Object.prototype` in an owner's session. | **Mitigated by input restrictions now**; **real fix needs a replacement or upgrade** (below). |
| vite 5.4.21 (fs.deny bypass on Windows, dep `.map` traversal) | high | No, dev server only | Mitigated by usage: production is static files; development happens on macOS. | Plan an upgrade to Vite 6.4.3+/7 separately; it's a major. |
| esbuild ≤0.24.2 (dev server CORS) | moderate | No, dev server only | Mitigated: don't run `npm run dev` on untrusted networks. | Clears when Vite is upgraded. |
| react-router / react-router-dom 6.30.6 (open redirect via `//` or `\` in `navigate`/`<Link>`) | moderate | Yes | Mitigated by usage: the post-login redirect comes from router `state.from` (set in-app), not from a URL parameter. | Upgrade to v7 (a major) later. Don't add `?redirect=` URL handling before then. |
| ws (via supabase realtime-js) | high → fixed | Node only; browsers use native WebSocket | n/a | Updated to 8.21.3. |
| postcss, nanoid, brace-expansion, browserslist, fast-uri, @babel/core | high/low → fixed | Build-time only | n/a | Updated in range. |

### xlsx mitigation implemented (spreadsheets uploaded by pharmacy users)
* `client/src/platform/import/spreadsheet.worker.ts` parses `.xlsx` **in a dedicated Web Worker**. That's
  a separate JavaScript realm, so prototype pollution can't reach the app's objects, and the worker is
  terminated after 15 s, which bounds ReDoS. The `xlsx` code now ships only in the worker chunk.
* `client/src/platform/import/parseSpreadsheet.ts` enforces a 5 MB file limit and a 5,000-row cap,
  reads the first sheet only (with formulas, HTML, styles and VBA disabled), **rejects legacy `.xls`**,
  drops the `__proto__`, `constructor` and `prototype` headers, and returns rows as plain strings
  (keys truncated to 64 characters, values to 500).
* Tested in headless Chromium: a valid workbook with a `__proto__` column previews 2 rows and
  `({}).polluted` stays `null`; a 6 MB file is rejected; `.xls` is rejected.
* **Recommended permanent fix:** replace the npm `xlsx@0.18.5` with SheetJS's official
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, which fixes both advisories (SheetJS no longer
  publishes to npm). **Your approval is needed**, since that changes the dependency's source. Keep the
  worker isolation either way.

## 8. Update after Phase 2

* **B1 (Demo Mode fail-open) — fixed** in Phase 2 (opt-in `VITE_DEMO_MODE`, `envDir` corrected).
* **B2, B3, B4, B5 — fixed** by migration `0011`; see `PHASE_2_SECURITY_REPORT.md`.
* **B6 (local infra) — partly cleared.** Stopping this project's Logflare `analytics` container
  (it was burning 162% CPU) freed enough of the Docker VM that Kong became reachable, so
  API-level end-to-end tests now run: 16/16 green through PostgREST with real JWTs.
  The VM is still oversubscribed (~7 stacks, load ~150-280), so runs are slow but reliable.
* **The §5 SPA table's "Demo build" column is historical**: an unconfigured build now shows
  "Supabase is not configured" instead of signing the visitor in as Demo Admin.
* Additional finding from Phase 2: on the pre-`0011` schema, the recursive RLS helpers made
  **every authenticated query on every tenant table fail** with "stack depth limit exceeded".

## 9. Blockers carried into Phase 2+

| # | Blocker | Severity |
|---|---|---|
| B1 | **Demo Mode fails open.** If `VITE_SUPABASE_URL`/`ANON_KEY` are missing at build time, every visitor is signed in as `Demo Admin` (role `admin`) with no authentication. Worse, `vite.config.ts` sets `root: client/`, so Vite never reads the repo-root `.env.local`, and **every local build is a Demo Mode build**. | Critical |
| B2 | Staff can promote themselves or move tenants (the self-update policy has no column restriction). | Critical |
| B3 | SECURITY DEFINER RPCs are executable by `anon`; there's no tenant check on customer or product IDs and no value validation. | Critical |
| B4 | The RLS helpers recurse through `users_profiles`. | High |
| B5 | No CHECK constraints (negative stock, quantities and prices are accepted). | High |
| B6 | Local Docker is resource-starved (§6), so API-level e2e tests are blocked locally. | Infra |
| B7 | xlsx still needs the vendor-source upgrade (needs your approval). | Medium (contained) |
| B8 | Dashboard hard-codes its date ("Wednesday, 22" shown on Tuesday 2026-09-22), plus seeded and synthetic data (Phase 3). | Medium |
