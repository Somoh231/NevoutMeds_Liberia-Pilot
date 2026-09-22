# NevOut Meds — Phase 2 Report: RLS / tenant security

Date: 2026-09-22
Backend: Supabase project `qohpyeqyveusnxhnbtxz` — **nothing was pushed to cloud.** All work is local.

## Gate status: **PASS**

* Migrations `0001` → `0011` apply to a **fresh** database with no manual steps.
* **83/83** SQL-level RLS checks pass (slowest check: 3 ms).
* **16/16** end-to-end checks pass through **PostgREST with real JWTs** — the same path the app uses.

---

## 1. Root cause of the "hour-long" baseline run

It was not one cause; it was two, and neither was a lock or a malformed test.

**a) Recursive RLS helpers (the real security bug, now fixed).**
`public.current_profile()` was SECURITY INVOKER and read `users_profiles`. The
`users_profiles` policies called `is_admin()` / `same_pharmacy()`, which called
`current_profile()` again:

```
customers policy → same_pharmacy() → current_profile() → SELECT users_profiles
                 → users_profiles policy → is_admin() → current_profile() → …
```

Postgres unwinds this at `max_stack_depth` (2 MB) and raises
**`stack depth limit exceeded`**. In the baseline run **21 of 79 checks failed
that way**, and several others "passed" only because the statement errored.

The practical impact is larger than a slow test: on the pre-0011 schema **every
authenticated query against every tenant table failed**, so real users could not
read their own pharmacy's data at all. A single recursing statement costs about
160 ms — enough to be slow, not enough to explain an hour.

**b) Docker VM CPU starvation (the reason wall-clock time exploded).**
Measured during the run:

* **70 containers**, about 7 Supabase stacks, sharing one Docker VM with 18 CPUs and 7.7 GB RAM.
* **Load average ~190–285.**
* The busiest processes were the Logflare `analytics` containers — **NevOut's own at 162% CPU**, Karkona's at 113%.
* A bare `docker exec … true` round-trip took **73 s** at one point and 0.3 s minutes later.
* Inside Postgres the same statements took **0.1–3 ms**, and `pg_locks` showed **zero ungranted locks**.

The test session was never hung: it kept progressing and finished on its own
(79 results recorded, then the backend exited). The host-side `docker exec` was
what appeared frozen.

**Not causes:** locks (none ungranted), SECURITY DEFINER behaviour, or the test
setup. Docker instability contributed only as CPU starvation.

**Actions taken:**
1. Stopped **this project's** `analytics` and `vector` containers and set `[analytics] enabled = false`
   in `supabase/config.toml`. Other projects' stacks were left alone.
2. The harness now runs every statement under `statement_timeout=15s`,
   `lock_timeout=5s`, `idle_in_transaction_session_timeout=30s`
   (60 s for migrations), so nothing can hang again.
3. A cancellation (SQLSTATE `57014`) is **always recorded as a failure**, so a timeout can never
   masquerade as a correctly rejected statement.
4. Each check records its own duration; the summary line prints the slowest.

After the fix the entire suite runs with a **3 ms** slowest check.

## 2. What migration 0011 changes

| Audit finding | Fix |
|---|---|
| Recursion-prone helpers | New `private` schema: `pharmacy_id()`, `user_role()`, `is_admin()`, `is_owner()`, `is_member_of()`, `current_profile()` — all SECURITY DEFINER with `search_path = ''`, so they read `users_profiles` **without** re-entering its policies. `public.current_profile/is_admin/same_pharmacy` remain as thin wrappers. Policies call them as `(select private.…())` so they evaluate once per statement. |
| Staff can change own role / pharmacy | `UPDATE` on `users_profiles` is revoked; only `name, email, last_login_at, last_seen_at` are granted at column level. A `BEFORE UPDATE` trigger additionally rejects any change to `role`, `pharmacy_id` or `id` coming from the `authenticated`/`anon` roles. |
| Owner can create/promote an admin | No INSERT or DELETE policy exists on `users_profiles` for API roles at all — provisioning happens only inside SECURITY DEFINER workflows (onboarding today, staff invites in Phase 4). |
| Pharmacy A reaching Pharmacy B | Every tenant table's policies were rebuilt on `private.pharmacy_id()`. Reads: own pharmacy, or admin. Writes: own pharmacy only, **including for admins** (admin is deliberately read-only for support). |
| Cross-tenant relationships | 13 **composite foreign keys** `(pharmacy_id, child_id) → parent(pharmacy_id, id)`. A purchase can no longer reference another pharmacy's customer even if policies were wrong. `SET NULL` FKs clear only the child column, so `pharmacy_id NOT NULL` still holds. |
| SECURITY DEFINER hardening | Every definer function pins `search_path`, checks the caller's tenant explicitly, and is executable by `authenticated`/`service_role` only. |
| `adjust_stock` | Rejects: no profile, foreign pharmacy, foreign-tenant product, zero/NULL delta, |delta| > 1,000,000, and any result below zero. Applies the change in a single `UPDATE … SET stock = stock + delta` (row lock, concurrency-safe), writes an auditable movement stamped with `auth.uid()`, and returns the new stock. |
| `record_purchase` | Validates the whole basket **before** writing: tenant, customer ownership, payment method (`Cash`, `Mobile Money`, `Credit`, `Diaspora Pay`, `Insurance`), 1–200 items, qty 1–100,000, price 0–1,000,000, per-item product ownership, and no overselling. `staff_id` is forced to `auth.uid()`, so a sale cannot be attributed to somebody else. |
| Impossible values | 10 CHECK constraints: non-negative stock/prices/credit limits, `qty > 0`, non-zero movement deltas, feedback rating 1–5, payment method allow-list. |
| `anon` exposure | `anon` had EXECUTE on all 9 public functions and 119 table privileges (Supabase's default grants). Both revoked, including via `ALTER DEFAULT PRIVILEGES` for future objects. Verified: **0 and 0**. |
| Forged attribution | `purchase_orders.created_by` and `documents.uploaded_by` must equal `auth.uid()`. |
| Ledger integrity | `purchases`, `purchase_items`, `stock_movements` and `inventory.stock` are no longer writable directly; they change only through the hardened RPCs. Non-quantitative `inventory` fields (`batch_id`, `expiry_date`) stay editable. |

Two new RPCs replace client-side multi-step writes (they also close Phase 3 items):
`create_product` (product + inventory + opening movement, atomic) and
`import_inventory_levels` (bulk stock import, server-side name matching, an
audit movement per change, and a per-row error report).

## 3. Client changes

* **Demo Mode no longer fails open.** It requires `VITE_DEMO_MODE=true`. Without Supabase config the app now shows "Supabase is not configured" instead of signing visitors in as `Demo Admin` with the admin role. Verified in a headless browser: `/platform`, `/import`, `/admin` all refuse.
* **`vite.config.ts` gains `envDir: __dirname`**, so the repo-root `.env.local` is actually read. Before this, *every* local build silently became a Demo Mode build.
* **Role and tenant are no longer read from `user_metadata`** (`roles.ts`), which users can write themselves via `auth.updateUser({ data: { role: "admin" } })`. The only trusted source is the `users_profiles` row; the fallback is the least-privileged role.
* `createProduct.ts` and the inventory import now call the new RPCs.

## 4. Test evidence

`supabase/tests/run_local_validation.sh` — fresh DB, migrations, then tests. It
mirrors a hosted project (postgres-owned DB, Supabase `public` grants and default
privileges, `pgcrypto` in `extensions`) and normalises `auth.uid()`/`auth.role()`
to the hosted definitions that read `request.jwt.claims`
(`supabase/tests/auth_claims_compat.sql`).

`supabase/tests/10_rls_tenant_security.test.sql` — **83 checks, 0 failed**,
simulating requests exactly as PostgREST does (`set role authenticated|anon`
plus JWT claim GUCs). Coverage:

* Pharmacy A cannot SELECT / UPDATE / DELETE Pharmacy B (customers, products, inventory, suppliers, profiles, pharmacy row).
* Cross-tenant INSERTs are rejected by RLS **and** by composite FKs.
* Staff cannot promote self to owner or admin, cannot change `pharmacy_id`, cannot insert profiles, cannot demote the owner — while still being able to do their job (update own `last_seen_at`, create customers, record purchases).
* Owner cannot create or promote an admin, and cannot touch pharmacy B's staff.
* Unauthenticated requests fail on every table and every RPC.
* Admin works only where intended: reads across pharmacies, but cannot edit or record a purchase in another pharmacy.
* A user with no profile sees nothing.
* `record_purchase` / `adjust_stock` reject foreign tenants, bad quantities, bad prices, bad methods and impossible stock; the valid path moves stock exactly (50→48→40) and leaves pharmacy B untouched.
* Structural: no definer function without a pinned `search_path`; `anon` has no EXECUTE and no table privileges; helpers no longer read `users_profiles` as invoker.

**API-level (blocker B6 cleared):** with the analytics container stopped, Kong
became reachable, so the chain was applied to the API-served database and
`api_e2e.mjs` ran **16/16 green** over HTTP with signed JWTs: tenant-scoped
reads, refused cross-tenant writes, refused self-promotion, refused foreign-tenant
RPC arguments, and a real purchase that moved stock 30→27 while pharmacy B stayed at 30.
(`anon` requests return an error either way; at DB level the denial is immediate —
"permission denied for table customers".)

## 5. Still open

| # | Item | Phase |
|---|---|---|
| B7 | `xlsx` vendor upgrade (`cdn.sheetjs.com` tarball) — **needs your approval**; contained today by worker isolation | 1 |
| B8 | Hard-coded dashboard date, seeded/synthetic data, customer-creation persistence | 3 |
| — | Staff invite → accept → provisioning lifecycle in a trusted server function | 4 |
| — | Realtime multi-user sync | 5 |
| — | Offline-first queue, replay/idempotency, conflict handling | 6 |
| Infra | Docker VM is still oversubscribed (~7 stacks). Local runs are reliable now but slow; `supabase stop` in unused projects would help | — |

Nothing has been committed — all changes remain in the working tree.
