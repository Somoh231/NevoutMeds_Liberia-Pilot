# NevOut Meds — Phase 5/6 Report: Multi-user realtime & true offline-first

Date: 2026-09-22
Backend: Supabase project `qohpyeqyveusnxhnbtxz` — **nothing deployed remotely.** All work is local.

## Final gate: **PASS**

| Gate | Result |
|---|---|
| Migrations `0001` → `0017` on a **fresh** database | 17/17 apply, no manual steps |
| SQL suites (Phases 2–6) | **252 checks, 0 failed** |
| API suites (real GoTrue logins, PostgREST, Storage, Realtime, Edge Function) | **113 checks, 0 failed** (41 + 48 + 24) |
| UI suites (real browser, real login, real network disconnection) | **53 checks, 0 failed** (15 + 17 + 21) |
| `npm run build` | passes |
| Idle background requests (45 s window) | **0** |

**Total: 418 executable checks, 0 failing.**

---

## Part A — Architecture before this phase

The honest starting point: **none of this existed.** A search for IndexedDB, Dexie, Realtime
subscriptions, a mutation queue, or persistence found nothing.

| Area | Before |
|---|---|
| TanStack Query | One client, `staleTime` 15 s, no persistence, default `networkMode: "online"` |
| Supabase Realtime | Not used at all; no table was in the `supabase_realtime` publication |
| IndexedDB / Dexie | Not used. Only `localStorage` for demo-mode seed data |
| Offline queue / sync engine | Did not exist |
| Service worker | Workbox precache + runtime caching for **assets only** (never API responses) |
| Mutations | Direct RPC calls; a lost response meant an unknown outcome |
| Tenant switching | In-memory query cache only; nothing persisted, so nothing to leak — and nothing to keep |

**After:** a dependency-free IndexedDB layer (cache + durable queue + metadata), an event-driven sync
engine, server-side idempotency receipts, one realtime channel per pharmacy, and honest sync states in
the UI. No new runtime dependency was added — Dexie would have cost bundle size that matters more on a
low-end Android phone than the convenience is worth.

## Part B — Realtime model

One channel per pharmacy (`pharmacy:<id>`), carrying exactly the operational tables:
`inventory, products, purchases, customers, reminders, purchase_orders, users_profiles`.
Audit logs, invitations, receipts, documents and app logs are deliberately **not** published.

* Every binding is filtered server-side by `pharmacy_id`, RLS still applies, and the client drops any
  event whose row is not its own pharmacy (three independent layers).
* `REPLICA IDENTITY FULL` is set on published tables so RLS can be evaluated on updates and deletes.
* Events are **coalesced**: a burst produces one invalidation per affected query key after a 400 ms
  debounce, instead of a refetch per row.
* Events are **deduplicated** by `(table, commit_timestamp, row id, event type)`, with a 500-entry
  rolling window, so a redelivery cannot double-apply.
* Local pending mutations are never overwritten: the queue is separate from the query cache, and an
  invalidation only refetches server state.

## Part C — Stock concurrency

All stock movement goes through transactional RPCs (`stock = stock + delta` in a single statement with
a row lock) — never client-side read-modify-write. Measured with genuinely parallel HTTP requests:

| Scenario | Result |
|---|---|
| 6 simultaneous sales of the same product | all 6 succeed; stock falls by exactly 6 (**no lost update**) |
| Concurrent restocks +10, +7 and −3 from two devices | all applied exactly once (net +14) |
| 4 concurrent oversell attempts | refused; **stock never negative** |
| Two devices replaying the same queued sale at once | exactly one purchase created |

## Part D — Local-first data

Cached per tenant: products, inventory, customers, purchases, reminders, suppliers, purchase orders,
dashboard snapshot, and the user/pharmacy context needed to work offline. Platform-admin data, audit
logs, invitations and staff management are **never** cached.

Every key is `pharmacy_id:user_id:entity`, so a second account on the same device cannot read the
first account's data.

## Part E — Persistent mutation queue

`local_id, idempotency_key, tenant_key, pharmacy_id, user_id, device_id, mutation_type, payload,
status, retry_count, created_at, last_attempt_at, synced_at, error_code, error_message, conflict,
summary` — statuses `pending | syncing | synced | failed | conflict`.

Verified to survive **closing and reopening the app while still offline** (tested), and it lives in
IndexedDB, so it also survives refresh, browser restart and power loss.

## Part F — Idempotency (server-side, not client memory)

`mutation_receipts (pharmacy_id, idempotency_key)` is unique, and the receipt is written **in the same
transaction** as the effects:

* first call — claims the key, does the work, stores the result;
* replay — hits the unique index and returns the stored result unchanged;
* concurrent replay — the second transaction blocks on the index, then returns the same result;
* failed first attempt — the receipt rolls back with it, so a retry legitimately performs the work.

Tested for purchases, stock adjustments, customers, reminders, products and purchase orders. Keys are
tenant-scoped: pharmacy B reusing pharmacy A's key string creates its own separate record and cannot
read or replay into A. Receipts cannot be forged or deleted by any client.

## Part G — Reconnect engine

Event-driven: `online`/`offline` events, tab visibility, app start, and new work being queued. Before
draining it confirms the backend actually answers (being "online" is not enough). Failures back off
exponentially (5 s → 10 s → 20 s … capped at 10 min, with jitter). The queue is processed oldest-first
and stops at the first blocking failure, so ordering is preserved.

**Measured: 0 background requests in a 45-second idle window.** There is no polling; live updates
arrive over one WebSocket.

## Part H — Conflict strategy

| Data | Strategy |
|---|---|
| Inventory | Transactional deltas, never last-write-wins. A replay is a no-op via the receipt. |
| Purchases | Immutable once recorded; replay returns the original id. |
| Customers | Create is idempotent and de-duplicates on `(pharmacy, phone)`; an offline re-create returns the existing customer instead of failing. |
| Reminders | Idempotent create; timestamp-based semantics. |
| Product metadata | Optimistic concurrency with a `version` column and `update_product_checked`. A stale edit is **rejected with 409**, never silently applied. |
| Anything the server rejects permanently | Queue entry becomes **`conflict`** and surfaces as "Needs attention" with the server's reason — never discarded. |

One subtlety worth recording: the conflict was first raised as SQLSTATE `40001`, which PostgREST
treats as a retryable serialization failure — it retried until the gateway timed out. It now raises
`PT409`, so the client gets an immediate, actionable 409.

## Part I — Account / tenant switch safety

* Query cache is cleared on any tenant or user change.
* IndexedDB cache and queue are partitioned by `pharmacy_id:user_id`; the sync engine only ever
  processes the current tenant's entries.
* Unsynced work is **not** deleted on logout — it stays in its own partition for its own user.
* The service worker caches assets only; a check confirms **no Supabase API responses are in any cache**.
* Verified in the browser: after signing out of Pharmacy A and into Pharmacy B on the same device,
  Pharmacy B sees none of A's customers, and A's queued work is untouched and invisible.

## Part J — Offline auth policy

A device that has already signed in keeps a **profile snapshot** (user, pharmacy, role, last known
status). It unlocks the local UI and the local queue only — it is a cached record of a previous server
decision, never a new one:

* the snapshot is used only when the account was last seen **active**;
* every queued write is authorised by the server when it syncs — a suspended user's queued purchase is
  rejected then (tested at SQL and API level);
* on reconnect the server's answer replaces the snapshot, and a suspended or removed account is signed out;
* a network error is never treated as an authorisation answer (the app does not sign people out
  because the connection dropped).

## Part K — UX states

`Synced · Offline · Waiting to sync · Syncing… · Sync failed · Needs attention`, shown in the platform
header with a per-item list (what is waiting, what failed, what needs a decision) and a manual retry.

The rule enforced in code and in tests: **work that only exists on the device is never described as
saved.** Offline, the toast reads "saved on this device — will sync when you are back online", and a
test asserts the UI does not claim otherwise.

## Parts L & M — Test results

**Multi-device (API, real logins + real Realtime): 24/24**
1 sale appears for the other user ✅ · 2 customer creation appears ✅ · 3 inventory adjustment ✅ ·
4 reminder ✅ · 5 supplier order ✅ · 6 simultaneous purchases keep stock exact ✅ ·
7 duplicate events carry a stable identity for dedupe ✅ · 8 Pharmacy A events never reach Pharmacy B ✅ ·
9 suspended staff loses access ✅ · 10 stale session cannot bypass server rules ✅.

**Offline (browser, network actually disabled via CDP): 21/21** — the required scenario, in order:
login online → data loads and is cached → disconnect → record work → close app → **reopen while still
offline** (data and queue both survive) → add more work → nothing has reached the cloud → reconnect →
**automatic sync** → every operation appears **exactly once** → queue drains → local and cloud agree →
refresh → state still correct → switch tenant → no leakage.

Also covered: replay after an uncertain response, failed server validation becoming a conflict,
suspension before queued work syncs, and tenant switch.

## Part N — Performance

| Measure | Result |
|---|---|
| Realtime subscriptions | **1 channel**, 7 table bindings, per pharmacy |
| Background requests while idle (45 s) | **0** — no polling |
| Refetches per realtime burst | 1 per affected query key, after a 400 ms debounce |
| IndexedDB writes | 1 snapshot write per successful query; 1 row per queued mutation |
| Main bundle | 654 kB → **586 kB** (179 → **163 kB gzip**) after splitting owner-only screens |
| Split chunks | Financials 7.5 kB · Staff 14 kB · Documents 22 kB · Analytics 26 kB · Import 9.6 kB · xlsx worker 366 kB (loaded only on import) |
| New runtime dependencies | **none** |

Day-to-day staff on a low-end phone download the main bundle only; the owner-only screens and the
spreadsheet parser are fetched on demand.

## Part O — Regression

| Suite | Result |
|---|---|
| Migrations 0001→0017 from empty DB | 17/17 |
| Phase 2 RLS security | 83/83 |
| Phase 3 data correctness | 125/125 cumulative |
| Phase 4 staff/auth | 215/215 cumulative |
| Phase 5/6 idempotency & conflicts | 252/252 cumulative |
| API: tenant isolation / staff+auth / realtime+offline | 41 · 48 · 24 |
| UI: workflows / staff lifecycle / offline-first | 15 · 17 · 21 |
| `npm run build` | passes |

No tenant-isolation or auth regression.

## Requirement classification

| Part | Requirement | Status |
|---|---|---|
| A | Architecture mapped before changing anything | **FIXED** |
| B | Tenant-safe realtime for operational entities, coalesced and deduped | **FIXED** |
| C | Stock concurrency without lost updates or negative stock | **FIXED** |
| D | Local-first data, partitioned by tenant | **FIXED** |
| E | Durable mutation queue surviving restart | **FIXED** |
| F | Server-side idempotency, exactly-once replay | **FIXED** |
| G | Event-driven reconnect engine with backoff and health check | **FIXED** |
| H | Per-type conflict strategy; dangerous conflicts surface as "Needs attention" | **FIXED** |
| I | Account/tenant cache, queue and SW isolation | **FIXED** |
| J | Offline auth policy; server authority on reconnect | **FIXED** |
| K | Honest sync states | **FIXED** |
| L | Multi-device tests (all 10) | **FIXED** |
| M | Offline scenario tests | **FIXED** |
| N | Performance measured and improved | **FIXED** |
| O | Regression gates | **FIXED** |

### Notes and open items

| Item | Status | Note |
|---|---|---|
| Offline sale / stock adjustment through the **UI** | **MITIGATED** | The queue path is identical for all six mutation types and is covered at API level; the browser test drives offline **customer creation** end-to-end. Driving the sale modal offline is a test-coverage gap, not a code gap. |
| Browser crash mid-sync | **MITIGATED** | Entries are written before sending and re-read on start, so an interrupted sync resumes; simulated by closing/reopening the app, not by killing the process. |
| Realtime after long disconnection | **NOT VERIFIED** | Supabase reconnects the socket automatically, and a reconnect triggers a queue drain plus invalidation, but a multi-hour disconnection was not exercised. |
| Realtime service resilience | Infra | The local Realtime container had been OOM-killed earlier and needed a restart, and it must be restarted after tables are added to the publication. Worth knowing for deployment. |
| Conflict resolution UI | **MITIGATED** | Conflicts are surfaced with the server's reason and can be retried; there is no per-field merge UI yet. |

## Carried-forward production items (still not deployed)

staff-admin Edge Function deployment · production SMTP/invite email · production environment variables ·
remote migrations (0001→0017) · Vercel production verification · backup/restore verification ·
production monitoring.

**Queued next major phase (not started):** world-class UI/UX + multi-country platform readiness —
design system, multi-tenant UX, auth UX, country configuration, multi-currency, localisation and
regulatory layers.

Nothing has been committed — all changes remain in the working tree.
