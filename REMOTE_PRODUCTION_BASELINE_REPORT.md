# NevOut Meds — Remote production baseline report

Date: 2026-09-22
Project: **`qohpyeqyveusnxhnbtxz`** — `https://qohpyeqyveusnxhnbtxz.supabase.co` (West EU, org `doglzwqacvlaeakmwigz`)
Frontend: `https://nevout-meds-liberia-pilot-somoh231s-projects.vercel.app`
Baseline: branch `hardening/phases-1-7`, tag `pre-phase8-hardened`

## Gate: **PASS WITH BLOCKERS**

The backend is deployed and verified against the real project with **191 executable checks passing**.
The two remaining blockers are external/manual production items — Vercel deployment protection and
SMTP — plus the plan/backup decision. No correctness, tenant-isolation, auth, stock-integrity,
duplicate-write or data-loss issue was found.

---

## 1. Pre-flight (before anything was changed)

| Check | Result |
|---|---|
| Linked ref independently confirmed | `qohpyeqyveusnxhnbtxz` (● LINKED in `projects list`) |
| Remote migration history | **empty** for all 17 |
| Remote `public` schema | **0 tables**, no app objects |
| Pre-existing object found | `public.rls_auto_enable()` — Supabase's own event-trigger helper that auto-enables RLS on new public tables. Compatible with our design (we enable RLS explicitly anyway); no conflict. |
| Storage | platform schema present, **no buckets** |

Clean-project assumption held, so the chain was applied.

## 2. Database — **PASS**

`supabase db push` applied **0001 → 0017**; `migration list` now shows Local/Remote matched for all 17.

Verified from a fresh remote schema dump (not from the push output):

| Object | Remote |
|---|---|
| Tables | **20** |
| Tables with RLS enabled | **20 / 20** |
| Policies | **50** |
| Foreign keys | **45** |
| CHECK constraints | **13** |
| Unique constraints | **11** |
| Indexes | **40** |
| Triggers | **2** (profile guard, product version) |
| `public` functions | **32** (31 ours + the platform helper) |
| `private` helper schema | present |
| Storage bucket `documents` | exists, **private**, 25 MiB limit, 6 MIME types |

## 3. Edge Function — **PASS**

`staff-admin` deployed (728.5 kB bundle). Secrets configured: `NEVOUT_ALLOWED_APP_ORIGINS`,
`NEVOUT_APP_ORIGIN`. `SUPABASE_SERVICE_ROLE_KEY` is platform-provided and exists **only** in the
function's environment — never in a `VITE_` variable, never committed, never printed.

Verified against the live function: owner can invite; **staff cannot invite** (403); **owner cannot
create a platform admin** (403); another pharmacy's owner cannot suspend this pharmacy's staff or
revoke its invitations (403); an untrusted `app_origin` is ignored (no open redirect).

## 4. Remote test results — **191 checks, 0 failures**

| Suite | Checks | Against |
|---|---|---|
| Tenant isolation, storage, idempotency | **41** | live project |
| Staff lifecycle & auth | **47** | live project + live Edge Function |
| Realtime, concurrency, conflicts | **25** | live project + live Realtime |
| UI workflows | **15** | real browser → live project |
| Offline sale + stock adjustment (real UI) | **25** | real browser → live project |
| Offline-first scenario | **21** | real browser → live project |
| Staff management UI | **17** | real browser → live project |

Highlights, all on the real backend:

* **Realtime** propagates customers, purchases, inventory, reminders and purchase orders between
  devices; **no Pharmacy A row ever reaches Pharmacy B's channel**.
* **Concurrency**: 6 simultaneous sales → stock fell by exactly 6; concurrent adjustments all applied;
  overselling refused; **stock never negative**.
* **Idempotency**: three replays of one key → one purchase; two devices replaying at once → one purchase.
* **Offline**: a sale and a stock adjustment recorded through the **real UI** while disconnected,
  surviving app close/reopen, syncing **exactly once** on reconnect (verified server-side).
* **Suspension**: cuts access on a live session, blocks sign-in (`user_banned`) and refresh; queued
  work is rejected and preserved as "Needs attention".
* **Audit log**: full lifecycle recorded; nobody can rewrite it; other pharmacies see nothing.

### A real gap this deployment exposed

Locally, invitations worked because the mail catcher accepted everything. On the real project **the
invite email fails (no SMTP) and the invited person then had no way to get an account** — the accept
page only offered sign-in. Fixed: the invitation link now supports creating an account. The account
alone grants nothing; the token, validated server-side, still decides pharmacy and role.

Two test defects were also fixed: the UI test sent a user JWT as the `apikey` header (accepted by the
local gateway, rejected by the real one), and the stock-adjustment test assumed which product a row
belonged to instead of reading it from the dialog.

## 5. Auth configuration — **ACTION REQUIRED**

Deployed and working: email/password login, session refresh, logout (refresh token invalidated),
suspension/ban behaviour. **Not yet configured** (dashboard → Authentication → URL Configuration):

| Setting | Set to |
|---|---|
| Site URL | `https://nevout-meds-liberia-pilot-somoh231s-projects.vercel.app` (or your custom domain) |
| Redirect allow-list | the same origin plus `/accept-invite`, `/reset-password`, and your Vercel preview pattern |

I did not push these: `supabase config push` would have sent my **local** config (localhost URLs,
local ports, db settings) to production, and I will not extract your CLI token from the macOS
Keychain to call the Management API. Two minutes in the dashboard is the safe route.

## 6. SMTP — **NOT VERIFIED (blocker for email flows)**

Supabase's built-in email is rate-limited; the project hit **429** on password reset and on signup
confirmation during testing. Consequences until SMTP is configured:

* invitation **emails** do not arrive → use the one-time WhatsApp link (the intended pilot channel, now fully working);
* **password reset is unusable** in practice;
* email confirmation on signup will block onboarding if enabled.

Provide SMTP in the dashboard (host, port, user, password/API key, verified sender domain).
**Recommendation for the pilot:** keep email confirmation **off** while invitations travel by
WhatsApp link, and turn it on once SMTP is live. The invitation token is the real authorisation gate.

## 7. Frontend / Vercel — **DEPLOYED, BLOCKED BY PROTECTION**

* Project `nevout-meds-liberia-pilot`, production deployment **Ready**.
* `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set for **Production and Preview**.
  The anon key is explicitly public config — it is browser-safe by design and protected by RLS.
* `VITE_DEMO_MODE` is **absent**, so a misconfigured deployment fails visibly rather than silently
  entering Demo Mode.

**Blocker:** Vercel **Deployment Protection (SSO)** is enabled — every request to the production URL
redirects to `vercel.com/login`. Pharmacy staff cannot reach the app, and browser tests cannot run
against it. Disable it at *Project → Settings → Deployment Protection* (I did not change this
myself: it is a security setting on your account).

Because of that, the browser suites ran against a local build pointed at the **live** project. That
verifies the application code against the real backend; it does **not** verify the deployed bundle or
PWA behaviour on the production URL. Those stay **NOT VERIFIED** until protection is lifted.

## 8. Backup / restore — **OPEN**

Unchanged from Phase 7 and still the most important open item: confirm the plan and rehearse one
restore before any real pharmacy data is entered. The Free plan has no guaranteed backups and no PITR.
`docs/BACKUP_AND_RECOVERY.md` holds the procedure; RPO/RTO stay unquoted until measured.

**All data currently in the project is synthetic** (`@e2e.local` accounts, "E2E Pharmacy A/B").

## 9. Monitoring — **READY, OWNERS MISSING**

`docs/PILOT_INCIDENT_RUNBOOK.md` is complete and its queries work against this schema. Two fields are
deliberately blank and need real names: **incident owner** and **backup owner**.

## 10. Classification

| Item | Status |
|---|---|
| Baseline frozen, committed, tagged, pushed | **FIXED** |
| Local gate (468 checks) | **FIXED** |
| Remote migrations 0001–0017 | **FIXED** |
| Remote schema / RLS / RPCs / constraints / indexes | **FIXED** |
| Realtime configuration and propagation | **FIXED** |
| Edge Function + secrets | **FIXED** |
| Storage bucket, policies, MIME/size limits, cross-tenant denial | **FIXED** |
| Remote E2E (synthetic) | **FIXED** — 191 checks |
| Remote security / tenant-isolation smoke test | **FIXED** |
| Invitation without SMTP | **FIXED** (link + self-signup) |
| Vercel environment configuration | **FIXED** |
| Deployed UI reachable | **OPEN** — Vercel SSO protection |
| PWA on the production URL | **NOT VERIFIED** — blocked by the above |
| Auth Site URL / redirect allow-list | **OPEN** — dashboard action |
| Production SMTP | **OPEN** — credentials required |
| Backup / restore rehearsal | **OPEN** — plan decision required |
| Incident owners | **OPEN** — names required |

## 11. What I need from you

1. **Disable Vercel Deployment Protection** for production (or give the pilot users SSO access).
2. **Set Auth Site URL + redirect allow-list** to the production origin.
3. **Configure SMTP** (or accept WhatsApp-link invitations for the pilot and leave reset unavailable).
4. **Confirm/upgrade the Supabase plan**, then I will rehearse a restore and record real RPO/RTO.
5. **Name the incident owner and backup owner.**

Items 1–2 are quick; until then the deployed URL cannot be exercised end-to-end.

## 12. Transition to Phase 8

The gate is PASS WITH BLOCKERS and every blocker is an external/manual production item, so the
transition rule is satisfied. Phase 8 may resume from **Part B (UX audit)** on a **separate design
branch**, leaving `pre-phase8-hardened` recoverable and independent.
