# NevOut Meds — Phase 7 Report: Final reliability & pre-production gate

Date: 2026-09-22
Target project: `qohpyeqyveusnxhnbtxz` — **still untouched. Nothing deployed.**

## Gate: **PASS WITH BLOCKERS**

All remaining blockers are **production-configuration items that cannot be completed before remote
deployment** (SMTP, Supabase plan/backups, deploying the Edge Function). There is **no correctness,
tenant-isolation, auth, stock-integrity, duplicate-write or offline data-loss blocker**, so the
transition rule permits moving on to Phase 8.

| Gate | Result |
|---|---|
| Migrations `0001`→`0017` from an empty database | 17/17 |
| SQL suites (Phases 2–6) | **252 checks, 0 failed** |
| API suites (real GoTrue logins, PostgREST, Storage, Realtime, Edge Function) | **113 checks, 0 failed** |
| UI suites (real browser, real login, real disconnection) | **102 checks, 0 failed** |
| `npm run build` | passes |
| **Total** | **467 executable checks, 0 failing** |

---

## 1. Offline sale through the real UI — **FIXED**

Driven entirely through the production interface (customer card → **+ Sale** → product select →
quantity → Record Purchase). No IndexedDB or API shortcuts.

| Check | Result |
|---|---|
| App shows **Offline** before the sale | ✅ |
| Product chosen from the **cached** inventory while offline | ✅ (`Para A — $1.00`) |
| UI says "saved on this device", **not** "Purchase recorded" | ✅ |
| Sale durably queued | ✅ |
| Nothing reached the server while offline | ✅ |
| Stock shows a **safe local pending state** ("Pending sync" marker) | ✅ |
| Queued sale survives closing and reopening the app while offline | ✅ |
| After reconnect: **exactly one** purchase in the database | ✅ (0 → 1) |
| Stock changed **exactly once** | ✅ (30 → 28) |
| Queue drained; state still correct after reload | ✅ |

## 2. Offline stock adjustment through the real UI — **FIXED**

Same treatment through the Adjust Stock dialog: queued offline, survives restart, syncs once
(`+6`: 28 → 34), **exactly one** `stock_movements` row for the note, correct after reload.

## 3. Long-disconnection realtime recovery — **FIXED**

Device B disconnected for a 30-second-plus blackout (well beyond keepalive) while Device A recorded a
customer, a sale, a stock adjustment and a reminder.

**The important design point:** realtime is treated as a notification transport, not a source of
truth. On every (re)subscribe and on every `online` event the client **refetches from Supabase**
rather than assuming missed websocket events will replay. That reconciliation was added in this phase
— without it, Device B would have shown stale data indefinitely.

Verified: B reconciles the customer it never received an event for, its count grows, inventory matches
the server value, **no duplicate rows**, and no duplicate channels.

## 4. Crash during sync — **FIXED**

Three mutations queued, sync started, then the renderer **killed outright with CDP `Page.crash`**
(the strongest crash the browser offers) ~700 ms in, with requests in flight. The browser was then
restarted from scratch.

| Check | Result |
|---|---|
| Queue recovered and every crashed mutation applied | ✅ (+3) |
| **No duplicate purchase** | ✅ |
| Stock moved exactly once per mutation | ✅ (38 → 35) |
| Exactly one receipt per mutation (idempotency held) | ✅ 3/3 |
| Queue clean after recovery | ✅ |

*Not reproducible locally:* killing the OS process mid-TCP-write, and device power loss. `Page.crash`
destroys the renderer without unload handlers, which is the closest available equivalent; durability
rests on IndexedDB writes happening **before** each send, plus server-side receipts.

## 5. Suspension / offboarding with queued work — **FIXED**

Staff queues work offline → owner suspends them from another device → staff reconnects and syncs.

| Expectation | Result |
|---|---|
| Server rejects the unauthorised work | ✅ 0 rows written |
| Queue records an actionable failure state | ✅ `conflict` — "unauthenticated or inactive account" |
| Work is **not** silently discarded | ✅ still in the queue |
| Inventory not corrupted | ✅ |
| UI tells the user access changed | ✅ badge reads **Needs attention** |

Improved during this phase: a permanent SQLSTATE (`42501`, `PT409`, `P0001`, `22xxx`, `23xxx`) is now
terminal — it becomes a conflict for the person to see, instead of retrying every few minutes forever.

## 6. Realtime restart resilience — **FIXED**

Realtime container stopped while the app was connected:

* the app **kept working** (REST unaffected) — customers still listed;
* writes still succeeded;
* after restarting the container the client **resubscribed and reconciled without a reload**, picking
  up the customer created during the outage;
* **no duplicate rows and no duplicate channels**.

## 7. Regression — **FIXED**

Everything re-run: 17 migrations from empty · Phase 2 RLS (83) · Phase 3 correctness · Phase 4
staff/auth · Phase 5/6 SQL (252 cumulative) · API 41 + 48 + 24 · UI 15 + 17 + 21 + 24 + 25 · build.
**No regression in tenant isolation or auth.**

## 8. Production configuration inventory — **documented, not applied**

Full checklist in **`docs/PRODUCTION_DEPLOYMENT.md`**: 17 migrations, 20 RLS tables, 31
functions, 13 composite tenant FKs, 10 check constraints; auth Site URL / redirects / confirmations /
password length / SMTP; `documents` bucket (private, 25 MiB, 6 MIME types, 4 policies); realtime
publication of 7 tables with `REPLICA IDENTITY FULL`; `staff-admin` secrets; Vercel variables; and a
rollout order with read-only verification queries.

Secret hygiene re-verified: **no `service_role` reference in `client/src` or the built bundle**, and
`VITE_DEMO_MODE` must be absent in production (setting it would bypass authentication).

## 9. Backup / restore — **OPEN (plan-dependent)**

Stated plainly in `docs/BACKUP_AND_RECOVERY.md`: **the Free plan cannot support an acceptable
production backup posture** — daily backups are not guaranteed, there is no PITR, and the project can
be paused for inactivity. **Move the project to Pro before real pharmacy data is entered.**

Also documented: database backups do **not** include storage objects, so a complete recovery is
database + storage + this repository + configuration. RPO/RTO are deliberately left unquoted until a
restore has actually been rehearsed.

A real mitigation already exists in the product: because every device holds a cache and a durable
queue, a backend outage is not immediate data loss — but that protects against downtime, not against
server-side data loss.

## 10. Monitoring / incident readiness — **FIXED (lightweight)**

`docs/PILOT_INCIDENT_RUNBOOK.md`: what to watch (failed-auth spikes, Edge Function errors, sync
failures, queue conflicts, DB/RPC failures, storage failures, app crashes), ready-made SQL for each,
first-response steps by symptom, escalation, and an incident log. It uses data the product already
records — no new observability stack.

The incident owner and backup owner are deliberately left blank: **assign real names before go-live.**

## 11. Git hygiene — **FIXED**

* All temporary debugging scripts removed (`rt_probe`, `dbg_offline`, `perf_probe`, `*.tmp.mjs`) — none remain.
* `tsconfig.tsbuildinfo` untracked and added to `.gitignore`.
* Secret scan: no credentials anywhere; the only service-role reference is `Deno.env.get(...)` in the Edge Function.
* Migrations are chronological and gap-free, `0001` → `0017`.
* A 19-commit plan is in **`docs/COMMIT_PLAN.md`**. Nothing has been committed or pushed.

---

## Classification

| Item | Status |
|---|---|
| Offline sale through the real UI | **FIXED** |
| Offline stock adjustment through the real UI | **FIXED** |
| Long-disconnection realtime recovery | **FIXED** |
| Crash-during-sync recovery | **FIXED** |
| Suspended / offboarded user with queued work | **FIXED** |
| Realtime restart resilience | **FIXED** |
| Full regression | **FIXED** |
| Production configuration inventory | **FIXED** (documented; application pending deployment) |
| Backup / restore | **OPEN** — needs a plan decision and one rehearsed restore |
| Monitoring / runbook | **FIXED** — owner names still to be assigned |
| Git hygiene & commit plan | **FIXED** — not committed, not pushed |
| OS-level process kill / power loss during sync | **NOT VERIFIED** — not reproducible in this environment |
| Supabase plan capabilities for `qohpyeqyveusnxhnbtxz` | **NOT VERIFIED** — remote project deliberately untouched |

## Remaining rollout blockers (all production-configuration)

1. **Production SMTP** — invitations and password resets need real email delivery.
2. **Supabase plan / backups** — move to Pro and rehearse one restore.
3. **Deploy `staff-admin`** with its secrets, including `NEVOUT_ALLOWED_APP_ORIGINS` for the real domain.
4. **Auth settings** — Site URL, redirect allow-list, enable email confirmations, raise the minimum password length.
5. **Vercel env** — `VITE_SUPABASE_URL`, anon key, and `VITE_DEMO_MODE` must not be set.
6. **Assign the incident owner** in the runbook.

None of these can be completed before you approve a deployment, which is why this gate is
PASS WITH BLOCKERS rather than FAIL.
