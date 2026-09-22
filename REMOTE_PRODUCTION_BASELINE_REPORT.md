# NevOut Meds — Remote production baseline report

Date: 2026-09-22
Target project: **`qohpyeqyveusnxhnbtxz`** — `https://qohpyeqyveusnxhnbtxz.supabase.co`

## Gate: **FAIL — blocked before deployment (external access)**

Nothing was deployed and **nothing on the remote project was touched**. The Supabase CLI on this
machine is authenticated as an account that cannot see or administer `qohpyeqyveusnxhnbtxz`, so
every remote step (migrations, Edge Function, auth configuration, storage, realtime, remote E2E,
security smoke test, backup rehearsal) is blocked at authentication.

This is **not** a software failure. The local hardened baseline is complete, committed, tagged and
green at **468 checks**.

---

## 1. The blocker, precisely

```
$ supabase projects list
  ORG ID               | REFERENCE ID         | NAME
  hutklrgrsytihrlscksw | pdohmtlavsjsgjvcjvua | Spendda R1A Security Validation
  hutklrgrsytihrlscksw | zuydkvfdlofsyqjzllnd | Pathlift
                       ← qohpyeqyveusnxhnbtxz is NOT in this list

$ supabase migration list --linked
  Initialising login role...
  unexpected login role status 403: {"message":"Your account does not have the necessary
  privileges to access this endpoint."}
```

* `supabase/.temp/linked-project.json` says the project belongs to
  organisation `doglzwqacvlaeakmwigz`, owned by **mdonzo1998@gmail.com**.
* The CLI's current session belongs to a **different organisation** (`hutklrgrsytihrlscksw`).
* The link file exists, but the credentials behind it do not grant access. "Linked" is not "authorised".

**Vercel is fine:** the Vercel CLI is authenticated as `somoh231`. It is blocked only because the
frontend needs the target project's URL and anon key, which require Supabase access first.

## 2. What you need to do (I cannot do these for you)

I will not handle your credentials, so these are yours to run:

1. **Authenticate the CLI as the account that owns the project.** In your own terminal:
   ```bash
   supabase login          # sign in as mdonzo1998@gmail.com (the project's owner)
   supabase projects list  # confirm qohpyeqyveusnxhnbtxz now appears
   ```
   Alternatively, if you prefer a token: create a Supabase **personal access token** and export it as
   `SUPABASE_ACCESS_TOKEN` in the shell you hand back to me. Do not paste it into the chat.

2. **Confirm the database password** for the project (needed by `supabase db push`). Set it as
   `SUPABASE_DB_PASSWORD` in that shell, or be ready to enter it when prompted.

3. **Decide the plan before real data** — see §5.

4. **SMTP credentials** (see §4) if you want invitation and reset emails working at the baseline.

Once the CLI can see the project, the remaining deployment is scripted and short; I have prepared the
exact sequence in `docs/PRODUCTION_DEPLOYMENT_INVENTORY.md`.

## 3. Step-by-step status

| Step | Status | Note |
|---|---|---|
| 1 · Freeze the hardened baseline | **PASS** | 20 logical commits on `hardening/phases-1-7`, tagged `pre-phase8-hardened`. Working tree clean. |
| 2 · Final local gate | **PASS** | 468 checks, 0 failures (see §6) |
| 3 · Plan / backup gate | **BLOCKED** | Plan cannot be read without project access |
| 4 · Deploy migrations | **BLOCKED** | `supabase db push` requires access |
| 5 · Edge Function | **BLOCKED** | deploy + secrets require access |
| 6 · Auth configuration | **BLOCKED** | Site URL, redirects, confirmations |
| 7 · Storage | **BLOCKED** | bucket + policies are created by migration `0013`, which has not run remotely |
| 8 · Realtime | **BLOCKED** | publication is created by `0017`, not run remotely |
| 9 · Vercel configuration | **BLOCKED** | needs the project's anon key |
| 10 · Deploy hardened UI | **BLOCKED** | would deploy an app pointing at an unmigrated backend |
| 11 · Remote E2E (21 flows) | **NOT RUN** | requires steps 4–10 |
| 12 · Remote security smoke test | **NOT RUN** | requires steps 4–10 |
| 13 · Backup/restore rehearsal | **NOT RUN** | requires a plan decision and a deployed project |
| 14 · Incident owners | **ACTION REQUIRED** | see §7 |
| 15 · This report | **PASS** | |

## 4. SMTP — what I need from you

Supabase's built-in email is rate-limited and not for production. To claim invitation email
readiness, the project needs real SMTP (Resend, Postmark, SendGrid, Amazon SES or your own).
Provide, in the Supabase dashboard (Auth → SMTP settings) rather than in chat:

* SMTP host and port
* username and password / API key
* sender address and sender name on a domain you control (SPF/DKIM configured)

Until a real invitation email has been **received and accepted**, invitation-by-email stays
**NOT VERIFIED**. The WhatsApp link path works without SMTP and is the intended pilot channel.

## 5. Plan and backup posture — decision required

Phase 7 concluded, and this report repeats: **the Free plan is not an acceptable production backup
posture** (no guaranteed daily backups, no PITR, projects paused after inactivity).

**Do not enter real pharmacy or patient data until the project is on Pro** (or better) and one restore
has been rehearsed. Deployment verification with synthetic data is safe on any plan.

## 6. Local baseline (the thing being frozen)

| Suite | Result |
|---|---|
| Migrations `0001`→`0017` from an empty database | 17/17 |
| SQL suites (Phases 2–6) | 252 checks, 0 failed |
| API: tenant isolation / staff+auth / realtime+offline | 41 · 48 · 25 |
| UI: workflows / staff / offline-first / offline sale+stock / recovery | 15 · 17 · 21 · 24 · 25 |
| `npm run build` | passes |
| **Total** | **468 checks, 0 failures** |

One fix was made during this gate: the realtime API suite now **waits for the Realtime service to be
ready** instead of assuming it. The recovery suite restarts that container, and a following run could
subscribe before it served events, producing five false failures. Verified by deliberately restarting
Realtime and re-running: 25/25.

### Baseline integrity

* Branch `hardening/phases-1-7`, tag **`pre-phase8-hardened`**, working tree clean.
* 20 commits, each a coherent change (no giant squash).
* Secret scan over the new history: no credentials. The only matches were a local test fixture
  password for `*@e2e.local` users, the Edge Function *reading* `SUPABASE_SERVICE_ROLE_KEY` from its
  environment, and password input fields.
* `.env.local` is git-ignored and was never committed. `tsconfig.tsbuildinfo` is now untracked.
* **Not pushed to GitHub** — awaiting your go-ahead.

## 7. Incident owners — assignment required

`docs/PILOT_INCIDENT_RUNBOOK.md` has two deliberately blank fields. I will not invent names:

* **Incident owner** — triages alerts, decides on restores, owns the pilot's uptime.
* **Backup owner** — covers when the incident owner is unavailable.

Tell me the names (or that you are both) and I will fill them in.

## 8. What happens next

Because the remote baseline was never established, the Phase 8 transition rule is **not** satisfied:
the redesign should not begin yet, and the two validation problems must stay separate.

When you have authenticated the CLI, the sequence is:

1. `supabase db push` (17 migrations) + read-only verification queries
2. Deploy `staff-admin` with its secrets (`SUPABASE_SERVICE_ROLE_KEY`, `NEVOUT_ALLOWED_APP_ORIGINS`)
3. Auth settings (Site URL, redirects, confirmations, password length, SMTP)
4. Verify storage, realtime, then Vercel env + deploy the **current** hardened UI
5. Run the 21-flow remote E2E and the security smoke test with synthetic accounts
6. Backup/restore rehearsal, then replace the estimated RPO/RTO with measured values
7. Only then: branch for Phase 8 and start the redesign
