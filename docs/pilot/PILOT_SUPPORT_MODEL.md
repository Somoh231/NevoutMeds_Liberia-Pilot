# Pilot support model

This is a simple model for **one controlled pilot pharmacy**. Names are placeholders until they
are assigned.

| Role | Who | Does |
|---|---|---|
| **First-line support** | Pilot Operator: ______ (TBD) | Receives every report, triages, answers questions, runs the health check |
| **Incident Owner** | **TBD** | Owns P0/P1 incidents end to end, decides to pause the pilot, talks to the owner |
| **Backup Owner** | **TBD** | Backups, restores, data-loss investigations |
| **Technical Support** | Engineer: ______ (TBD) | Product defects, data fixes, deployments; only on escalation |

**Support channels given to the pharmacy:**
- WhatsApp: the number set as `VITE_SUPPORT_WHATSAPP`, which the in-app **WhatsApp support**
  button opens (**TBD**);
- email: `VITE_SUPPORT_EMAIL` (**TBD**, and must be a mailbox someone reads);
- in-app **Help & feedback → Report issue**, stored in `app_feedback`.

**Support hours:** pharmacy opening hours, Liberia time (GMT). A P0 outside hours goes to the
Incident Owner by phone.

## Severity levels

| | **P0: Critical** | **P1: Major** | **P2: Minor** | **P3: Question / idea** |
|---|---|---|---|---|
| **Meaning** | The pharmacy can't operate, **or** data or security is suspect | A major workflow is unavailable; the pharmacy can still trade some other way | A workflow problem with a workaround | Questions, how-to, improvement requests |
| **Examples** | <ul><li>Nobody can sign in</li><li>Another pharmacy's data is visible</li><li>Sales or stock missing, or doubled</li><li>Stock changes nobody made</li><li>A lost owner phone</li><li>Backups failing with no recent good backup</li></ul> | <ul><li>Sales can't be recorded on any device, even offline</li><li>Sync failing for more than 2 hours while online</li><li>Staff can't sign in</li><li>The owner locked out (forgotten password while SMTP is open)</li><li>Import failing for the whole file</li></ul> | <ul><li>A report number looks wrong</li><li>One "Needs attention" item that isn't understood</li><li>An invitation expired</li><li>A supplier price can't be saved</li><li>WhatsApp doesn't open</li></ul> | <ul><li>"How do I…?"</li><li>Missing feature (walk-in sales, credit repayments, product edit)</li><li>Wording and layout suggestions</li></ul> |
| **First response** | **Within 1 hour**, during and outside hours | Within 4 working hours | Next working day | Within 3 working days |
| **Target to resolve or work around** | Same day. The pilot is paused if not contained ([PILOT_STOP_CONDITIONS.md](PILOT_STOP_CONDITIONS.md)). | 1 working day | Within the week | Logged for the weekly review |
| **Escalation** | Operator → **Incident Owner immediately** → Technical Support. Data issues also go to the **Backup Owner**. | Operator → Technical Support; the Incident Owner is informed | Operator → Technical Support backlog | Operator → feedback log |
| **Tell the pharmacy** | What to do right now (for example "keep selling offline and don't sign out", or "stop using the app, use the paper book"), then updates every 2 hours | The workaround and an expected time | The workaround | Thanks, and whether it's planned |

## What support must collect (every report)

Use [SUPPORT_ISSUE_TEMPLATE.md](SUPPORT_ISSUE_TEMPLATE.md). The minimum:
- the pharmacy, the person, their device;
- the time it happened (Liberia time);
- online or offline, and **what the sync pill says**;
- what they were doing, what happened, what they expected;
- a screenshot.

**Never ask for a password, and never accept one.** If one is sent, tell the person to consider
it exposed. Reset needs SMTP (P1 while SMTP is open).

## First-line checks (operator, before escalating)

1. `node ops/monitor/health-check.mjs`: site, API, Edge Function, backups, sync, integrity.
2. `node ops/provision/check-account.mjs --email <user>`: does the account exist, is it active,
   is it in the right pharmacy?
3. Is it offline behaviour? For example, "My sale isn't on the other phone" while the pill says
   Waiting to sync is expected; see the [owner training guide §16](OWNER_TRAINING_GUIDE.md).
4. Look it up in [docs/PILOT_INCIDENT_RUNBOOK.md](../PILOT_INCIDENT_RUNBOOK.md) (symptom list and
   read-only SQL).

## Logging

Every P0, P1 and P2 goes in the incident log in `docs/PILOT_INCIDENT_RUNBOOK.md` §4: date,
pharmacy, symptom, cause, fix. P3s go in the feedback log ([PILOT_FEEDBACK_PLAN.md](PILOT_FEEDBACK_PLAN.md)).

## Reading in-app reports (daily)

In the Supabase SQL editor (read-only):

```sql
select created_at, kind, rating, title, message, page
from public.app_feedback
where created_at > now() - interval '3 days'
order by created_at desc;
```
