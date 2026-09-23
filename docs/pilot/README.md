# NevOut Meds pilot pack

Everything needed to onboard, train, support and evaluate the **first controlled Liberia pilot
pharmacy**, without an engineer present. Start with the
[master checklist](PILOT_LAUNCH_MASTER_CHECKLIST.md).

**Before any real data:** [BACKUP_PRE_FLIGHT.md](BACKUP_PRE_FLIGHT.md) must be complete, and the
Incident Owner and Backup Owner must be named. Both are currently **TBD**.

## By audience

### NevOut operator (runs onboarding and daily pilot operations)

| Document | Use it to |
|---|---|
| [PILOT_LAUNCH_MASTER_CHECKLIST.md](PILOT_LAUNCH_MASTER_CHECKLIST.md) | Track the whole launch, A–M, and sign go-live |
| [FIRST_PHARMACY_LAUNCH_WORKFLOW.md](FIRST_PHARMACY_LAUNCH_WORKFLOW.md) | Understand the end-to-end sequence and the known product limits |
| [PILOT_INTAKE_TEMPLATE.md](PILOT_INTAKE_TEMPLATE.md) | Collect only the information needed |
| [OPERATOR_ONBOARDING_CHECKLIST.md](OPERATOR_ONBOARDING_CHECKLIST.md) | Follow it during the onboarding call |
| [OWNER_PROVISIONING_GUIDE.md](OWNER_PROVISIONING_GUIDE.md) | Create accounts securely while SMTP is unavailable |
| [DATA_IMPORT_GUIDE.md](DATA_IMPORT_GUIDE.md) and [`templates/`](templates/) | Prepare and import products, stock and customers |
| [OPENING_INVENTORY_RECONCILIATION.md](OPENING_INVENTORY_RECONCILIATION.md) | Prove the opening stock, with owner sign-off |
| [FIRST_DAY_VALIDATION.md](FIRST_DAY_VALIDATION.md) | Run the 19 go-live tests |
| [BACKUP_PRE_FLIGHT.md](BACKUP_PRE_FLIGHT.md) | Work through the hard backup gate |
| [PILOT_OPERATING_CADENCE.md](PILOT_OPERATING_CADENCE.md) | Follow the daily and weekly routine for two weeks |
| [PILOT_FEEDBACK_PLAN.md](PILOT_FEEDBACK_PLAN.md) | Run the Day 1 / Day 3 / Week 1 / Week 2 reviews |
| [PILOT_SUCCESS_METRICS.md](PILOT_SUCCESS_METRICS.md) | Decide which numbers matter, with queries in `ops/monitor/pilot-metrics.sql` |
| [PILOT_STOP_CONDITIONS.md](PILOT_STOP_CONDITIONS.md) | Know when to pause |

### Pharmacy owner

| Document | Use it to |
|---|---|
| [OWNER_TRAINING_GUIDE.md](OWNER_TRAINING_GUIDE.md) | Learn what each part of the app is for |
| [STAFF_ONBOARDING_GUIDE.md](STAFF_ONBOARDING_GUIDE.md) | Add staff; learn the permissions; handle leavers and lost phones |
| [OFFLINE_TRAINING.md](OFFLINE_TRAINING.md) | Practise working offline |
| [SUPPORT_ISSUE_TEMPLATE.md](SUPPORT_ISSUE_TEMPLATE.md) | Know what to send when something goes wrong |

### Pharmacy staff

| Document | Use it to |
|---|---|
| [STAFF_QUICK_START.md](STAFF_QUICK_START.md) | Learn daily tasks on two pages |
| [OFFLINE_TRAINING.md](OFFLINE_TRAINING.md) | Do the offline exercise on your device |

### Technical support / incident owner

| Document | Use it to |
|---|---|
| [PILOT_SUPPORT_MODEL.md](PILOT_SUPPORT_MODEL.md) | Apply the severities, response times and escalation |
| [PILOT_STOP_CONDITIONS.md](PILOT_STOP_CONDITIONS.md) | Know when to pause and how to resume |
| [../PILOT_INCIDENT_RUNBOOK.md](../PILOT_INCIDENT_RUNBOOK.md) | Diagnose by symptom, with read-only SQL |
| [../MONITORING.md](../MONITORING.md) | Understand health-check alerts |
| [../BACKUP_AND_RECOVERY.md](../BACKUP_AND_RECOVERY.md) | Back up and restore |
| [../STAFF_AUTH_ARCHITECTURE.md](../STAFF_AUTH_ARCHITECTURE.md) | Understand accounts, SMTP status and the provisioning fallback |
| [../OFFLINE_ARCHITECTURE.md](../OFFLINE_ARCHITECTURE.md) | Understand how offline sync works |

## Operator tools (`ops/`, run on the operator's machine only)

| Command | Does |
|---|---|
| `node ops/provision/provision-owner.mjs …` | Creates an owner or staff account, plus a single-use setup link |
| `node ops/provision/check-account.mjs --email …` | **Read-only:** account state, pharmacy, role, members, open invitations |
| `node ops/monitor/health-check.mjs` | Checks site, API, Edge Function, backups, sync, integrity |
| `ops/monitor/pilot-metrics.sql` | Read-only pilot metrics M1–M8 (Supabase SQL editor) |
| `ops/backup/*.sh` | Backup, verify, restore (`ops/README.md`) |

## Current human items before the first real data

1. **Incident Owner:** TBD
2. **Backup Owner:** TBD
3. **Backup pre-flight:** backup host, off-site destination, schedule, first scheduled backup,
   and restore test
4. **Account creation:** SMTP (OPEN), or operator provisioning
5. **Support contacts:** WhatsApp number and a read support mailbox, set in the build
6. **Pilot agreement** covering personal data
7. The first pharmacy's intake information ([PILOT_INTAKE_TEMPLATE.md](PILOT_INTAKE_TEMPLATE.md))
