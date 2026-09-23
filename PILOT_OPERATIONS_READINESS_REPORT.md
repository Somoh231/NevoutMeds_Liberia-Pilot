# Pilot operations readiness report: first controlled Liberia pharmacy

Date: 2026-09-23 · Branch `phase8/ux-design-system` · Phase 10 (pilot onboarding, training and
launch package). Builds on [BUILD_COMPLETION_REPORT.md](BUILD_COMPLETION_REPORT.md).

Pilot pack: [docs/pilot/README.md](docs/pilot/README.md). **No real pharmacy was onboarded, and
no real customer or patient record was created.**

## Answers

| # | Question | Status | Basis |
|---|---|---|---|
| 1 | Is the software build complete? | **READY** | Build complete per the build-completion report. Phase 10 added only small onboarding fixes (below), each covered by regression. |
| 2 | Is the onboarding process documented? | **READY** | End to end, in [FIRST_PHARMACY_LAUNCH_WORKFLOW.md](docs/pilot/FIRST_PHARMACY_LAUNCH_WORKFLOW.md), the [operator checklist](docs/pilot/OPERATOR_ONBOARDING_CHECKLIST.md) and the [master checklist](docs/pilot/PILOT_LAUNCH_MASTER_CHECKLIST.md). Each step names the document and what "done" means. |
| 3 | Can an operator provision the first pharmacy? | **READY WITH HUMAN ACTION** | The tools exist and are tested: `provision-owner.mjs` (10/10 e2e) and the new read-only `check-account.mjs`, which verifies role, pharmacy, country, currency and members. **Human:** an operator machine with the service-role key file, a verified owner, and support contacts. |
| 4 | Can owner and staff be trained without engineering help? | **READY** | [Owner guide](docs/pilot/OWNER_TRAINING_GUIDE.md) (18 areas), [staff quick start](docs/pilot/STAFF_QUICK_START.md), [staff onboarding](docs/pilot/STAFF_ONBOARDING_GUIDE.md), the offline exercise and first-day validation. The staff-facing material has no developer terms, and every screen name and message was taken from the app itself. |
| 5 | Can the pharmacy operate offline? | **READY** | Offline suites pass (below), and the 10-step [offline exercise](docs/pilot/OFFLINE_TRAINING.md) is written. **New:** "Needs attention" items can now be resolved, and a sign-out with unsynced work is warned about. |
| 6 | Is a support procedure defined? | **READY WITH HUMAN ACTION** | [Support model](docs/pilot/PILOT_SUPPORT_MODEL.md) with P0–P3, response targets, escalation and what to collect, plus the [issue template](docs/pilot/SUPPORT_ISSUE_TEMPLATE.md). **Human:** name the people behind the roles, choose a support WhatsApp number and a support mailbox that is read, and set them in the build. |
| 7 | Are pilot success metrics defined? | **READY** | [PILOT_SUCCESS_METRICS.md](docs/pilot/PILOT_SUCCESS_METRICS.md): reliability, adoption, operational value, support and user value. Read-only queries M1–M8 are in `ops/monitor/pilot-metrics.sql` (run against the schema). Metrics that need instrumentation are marked (time to record a sale, stockouts prevented, discrepancy by recount). |
| 8 | Are stop conditions defined? | **READY** | [PILOT_STOP_CONDITIONS.md](docs/pilot/PILOT_STOP_CONDITIONS.md): S1–S8, first actions, resume criteria, and what does **not** require stopping |
| 9 | What human actions remain before first real data? | **NOT READY** (human) | Listed below |
| 10 | What must we collect from the first pharmacy? | **READY** (the form) | [PILOT_INTAKE_TEMPLATE.md](docs/pilot/PILOT_INTAKE_TEMPLATE.md), minimum only; summarised below |

**Overall:** the operational pilot package is **complete**. The first real pharmacy can be
onboarded **only after** the human items in section 9 are done: above all the backup pre-flight
and the named owners.

## 9. Human actions remaining before the first real data

| # | Action | Owner | Gate |
|---|---|---|---|
| H1 | Name the **Incident Owner** | Business | Master checklist A; stop conditions need a decision-maker |
| H2 | Name the **Backup Owner** | Business | [BACKUP_PRE_FLIGHT.md](docs/pilot/BACKUP_PRE_FLIGHT.md) |
| H3 | **Backup pre-flight:** backup machine, `backup.env`, the passphrase plus an offline copy, the off-site destination, the schedule, a first scheduled backup, and a **restore from it** | Backup Owner | **Hard gate** |
| H4 | **Account creation path:** configure SMTP (recommended), **or** accept operator provisioning. With provisioning, forgotten passwords can't be reset until SMTP exists. | Business / ops | Master checklist A |
| H5 | **Support contacts:** a WhatsApp number and a mailbox that is read. Set `VITE_SUPPORT_WHATSAPP` / `VITE_SUPPORT_EMAIL` in Vercel, then redeploy (no code change). Confirm `support@nevoutmeds.com` exists, or replace it. | Business + deploy | Master checklist A |
| H6 | **Pilot agreement** covering personal data (names, phones, purchase history; no diagnoses in notes) | Business / legal | Master checklist C |
| H7 | **Operator machine:** service-role key file (chmod 600) and Node, for the provision, check-account and health-check tools | Operator | Master checklist A / D |
| H8 | **Alert delivery:** a webhook, or a named daily reader of the health check | Operator | Pre-flight item 9 |
| H9 | Choose the **first pharmacy** and complete its intake | Operator | Master checklist C |

## 10. Information to collect from the first pharmacy

From [PILOT_INTAKE_TEMPLATE.md](docs/pilot/PILOT_INTAKE_TEMPLATE.md):

- **Pharmacy:** business and operating name, location, phone, optional email, country (Liberia),
  **selling currency (US$ / L$)**, payment methods taken, opening hours.
- **Owner:** name, own email, verified phone/WhatsApp, and how identity was verified.
- **Staff:** name, own email, role, device.
- **Operations:** approximate SKU count, daily sales, current stock method or software, internet
  and power reliability, devices, how credit is handled, main suppliers.
- **Data readiness:** product list, stock quantities, expiry dates, suppliers and prices, and
  (optionally) consenting customers; the file format.

**Not collected:** passwords, ID numbers, bank or card details, licence numbers, patient
information.

---

## Product fixes made in Phase 10

These were small defects found while writing the materials. Each would have blocked or corrupted a
first-pharmacy onboarding. There is no new feature and no redesign.

| Defect found | Impact on onboarding | Fix | Test |
|---|---|---|---|
| **Import: headers matched case-sensitively.** `Name`, `Unit Cost` passed the column check, then every row failed as "missing name". | A normal Excel sheet imports nothing | Headers are normalised (case, spaces and hyphens → `_`) | `ui_import` |
| **Import: prices like `$5.00` or `1,200` were silently saved as 0**; a blank stock cell set stock to 0 | Corrupt opening prices and stock | Strict numbers (thousands separators accepted, symbols rejected with a reason); blank stock rejected | `ui_import` |
| **Import: "Skip duplicates" failed the whole file** if any product existed; a repeated name within the file also failed the whole import | The import can't be repeated after fixing errors | "Leave unchanged" really skips existing rows, and reports how many; in-file repeats are reported by row | `ui_import` |
| **Import: Excel phone numbers became `2.3177E+11`**, and Excel dates became `12/31/27` text (day/month ambiguity) | Corrupt customer phones; misread expiry dates | The spreadsheet reader passes numbers exactly and date cells as `YYYY-MM-DD`; typed `31/12/2027` is rejected, not guessed | `ui_import` |
| **Import: customer phones stored as typed**, unlike the customer form (+231…) | Duplicate customers; broken WhatsApp links | Phones are validated and normalised with the same country rules as the form | `ui_import` |
| **Import: inventory error row numbers were off by one**; developer text ("Upsert", "hardening step") shown to owners | Confusing error reports | Spreadsheet row numbers everywhere; plain-language choices and messages | `ui_import` |
| **"Needs attention" could never be cleared.** A refused change stayed on the device forever, with a permanent red banner on every screen (the runbook referred to a dismiss action that didn't exist). | Staff learn to ignore the alarm, so real new problems are hidden | Each refused item shows its reason, and **"I've dealt with this — remove it"** (two-step, conflicts only, logged as `sync_conflict_dismissed`) | `ui_foundation` |
| **Signing out with unsynced work gave no warning.** That work syncs only when the same person signs in again on that device (common on shared counter devices). | Offline sales appear "lost" | A confirmation dialog when work is waiting: **Stay signed in** / Sign out anyway | `ui_foundation` |
| **The Help → WhatsApp support button had no recipient**; the support email was hard-coded | Staff don't know who to message | Configurable `VITE_SUPPORT_WHATSAPP` / `VITE_SUPPORT_EMAIL`; the behaviour is unchanged until set | Typecheck; checklist test 18 |
| **The Documents screen claimed "DOC … max 10MB"** while storage accepts DOCX, WEBP, … up to 25 MB | Uploads of `.doc` fail unexpectedly | Hint matches the real limits | — |

**New operator tooling:**
- `ops/provision/check-account.mjs` (read-only account, role and pharmacy verification);
- `ops/monitor/pilot-metrics.sql` (read-only metrics M1–M8);
- synthetic import templates in `docs/pilot/templates/`, which the import test imports cleanly.

**Known product limits, documented with workarounds** (not fixed; they are feature work to
prioritise from pilot feedback):
- every sale needs a customer, so there is a "Walk-in Customer" record;
- credit repayments can't be recorded;
- there is no product edit screen: re-import with Update;
- deliveries aren't received against purchase orders: Adjust stock → Delivery received;
- one batch and one expiry per product;
- only the latest supplier price is kept.

## Regression

All runs were on the local stack with synthetic data, after the Phase 10 changes.

| Suite | Result |
|---|---|
| SQL, fresh DB from migrations (RLS, correctness, staff, offline, country, ops) | **354/354** |
| Country config / design-token contrast | **77/77** · **27/27** |
| Typecheck and production build | OK. Main JS **160.37 kB gzip** (+0.7 kB); budget ~165 kB. |
| **`ui_import` (new)**: headers, strict numbers and dates, duplicates, update vs leave-unchanged, E.164 phones, XLSX cells, row numbers, the shipped templates, staff denied | **32/32** |
| `ui_foundation` (with the new conflict-removal and sign-out-warning checks) | **53/53** |
| `ui_phase8_correctness` / `ui_core_flows` / `ui_workflows` | 14/14 · 81/81 · 15/15 |
| `ui_offline_first` / `ui_offline_sale_stock` / `ui_recovery` | 21/21 · 25/25 · 26/26 |
| `ui_staff_lifecycle` / `api_staff_lifecycle` / `api_tenant_isolation` / `api_realtime_offline` | 17/17 · 47/47 · 41/41 · 25/25 |
| `ui_country_pilots` / `ui_owner_provisioning` | 46/46 · 10/10 |
| Pilot metrics queries M1–M8 | All run against the schema |

**One failure during the run, caused by the test machine rather than the app.**
- **What happened:** `ui_owner_provisioning` first failed at P4. A headless Chrome orphaned by an
  earlier crashed test was still holding its debugging port, so the test attached to the stale
  browser.
- **Result after cleanup:** stale processes stopped, and the rerun passed **10/10**.
- **Fix:** the test harness now always stops its browser when a test process exits.

Production was not changed in Phase 10: no migration, no deploy, no data. The Phase 10 client
changes are committed but **not yet deployed**. Deploy them with the support-contact variables
(H5) through the normal procedure (`docs/PRODUCTION_DEPLOYMENT.md`): the verified build, then the
signed-out smoke test and health check.
