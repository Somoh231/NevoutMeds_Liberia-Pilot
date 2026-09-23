# Pilot operating cadence: first two weeks

Internal routine for the NevOut Meds team. **Owner:** Pilot Operator (TBD), with the Incident
Owner (TBD) and Backup Owner (TBD) as named.

The commands below run on the operator's machine, with the environment from
[OWNER_PROVISIONING_GUIDE.md](OWNER_PROVISIONING_GUIDE.md#setup-one-time-on-the-operators-machine).

## Daily: days 1–3 (about 20 minutes, before the pharmacy opens, plus an end-of-day call)

| # | Check | How | Act if |
|---|---|---|---|
| 1 | **Backups** | Health check `backups:` line: database and storage age < 26 h. The backup host's log has last night's `backup_succeeded`. | Missing or failed → Backup Owner, **today**. See the runbook, "Backup failed". Two days with no good backup → [stop condition S5](PILOT_STOP_CONDITIONS.md). |
| 2 | **Health** | `node ops/monitor/health-check.mjs` → HEALTHY | Any `INTEGRITY` alert → P0. Other alerts → [docs/MONITORING.md](../MONITORING.md). |
| 3 | **Sync failures** | Health check `sync failures`; `pilot-metrics.sql` M4 | Any → call the pharmacy: which device, is it online? |
| 4 | **Conflicts** | Health check `sync conflicts`; M4 `conflicts_all` vs `conflicts_cleared` | Any → make sure the owner understood and resolved it |
| 5 | **Support** | WhatsApp, the support email, and in-app feedback (`app_feedback` query in the support model) | Triage by severity; log everything |
| 6 | **Usage** | M1 (sales per day), M2 (per person) | No sales by midday → call |
| 7 | **Contact the pharmacy** | A 5-minute end-of-day call (Day 1 is the full review) | Note friction for the Day-3 review |

## Days 4–14: 2–3 times per week (Mon / Wed / Fri)

| Check | How |
|---|---|
| **Health and backups** | The health check. The **daily** automated schedule keeps running; this is a human read of it. |
| **Support** | Close resolved items; chase open ones against their targets |
| **Usage** | M1–M3 and M8. Active days, adjustments, staff use. |
| **Feedback** | Add to the feedback log; spot repeated themes |
| **Weekly verify** (Fridays) | `ops/backup/verify-backup.sh <newest DB artifact>` → `"ok":true` |

The automated jobs run every day regardless (`ops/README.md`):
- nightly database and storage backups;
- an hourly health check with a webhook alert, if configured.

## Week 1 review (day 7)

**Internal preparation (30 minutes):**
- compile M1–M8 for days 1–7;
- the incident list;
- feedback themes;
- whether the recount is due.

**With the pharmacy:** the [Week 1 feedback review](PILOT_FEEDBACK_PLAN.md#week-1).

**Internal decision:** continue as is / fix first / stop. Write down the top 3 issues, with an
owner for each.

## Week 2 review (day 14)

**Internal preparation (1 hour):** the full metrics pack against the baseline
([PILOT_SUCCESS_METRICS.md](PILOT_SUCCESS_METRICS.md)).

**With the pharmacy:** the [Week 2 feedback review](PILOT_FEEDBACK_PLAN.md#week-2).

**Internal outputs:**
- a pilot summary;
- a continue / stop decision;
- the next engineering priorities;
- whether a second pharmacy can be onboarded.

A second pharmacy needs:
- the stop conditions clear;
- the tenant-isolation suite re-run on staging;
- the support load manageable.

## Always, at any time

- A P0 → Incident Owner immediately ([PILOT_SUPPORT_MODEL.md](PILOT_SUPPORT_MODEL.md)).
- A stop condition → pause ([PILOT_STOP_CONDITIONS.md](PILOT_STOP_CONDITIONS.md)).
- Before any production deploy during the pilot: take a backup, deploy, then run the
  health check. The procedure is in `docs/PRODUCTION_DEPLOYMENT.md`. Avoid deploying during
  pharmacy opening hours.
