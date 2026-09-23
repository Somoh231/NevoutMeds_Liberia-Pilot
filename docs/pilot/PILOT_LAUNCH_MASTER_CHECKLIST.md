# Pilot launch master checklist

One page for the whole launch. Each line links to the document that says how. **Sections A and
B are hard gates: nothing real is entered before both are complete.**

Pharmacy: ______ · Planned go-live: ______ · Operator: ______

## A. Technical baseline

- [ ] Health check HEALTHY on the day (`node ops/monitor/health-check.mjs`)
- [ ] Production is on the tested release (`docs/PRODUCTION_DEPLOYMENT.md`); no deploy planned
      during the first week
- [ ] Support contacts set in the app build (`VITE_SUPPORT_WHATSAPP`, `VITE_SUPPORT_EMAIL`), and
      the Help → WhatsApp support button opens the right chat
- [ ] Support mailbox exists and someone reads it
- [ ] **Incident Owner named** (`docs/PILOT_INCIDENT_RUNBOOK.md`): ______
- [ ] Account creation path decided: SMTP configured **or** operator provisioning
      ([OWNER_PROVISIONING_GUIDE.md](OWNER_PROVISIONING_GUIDE.md))

## B. Backups (hard gate)

- [ ] [BACKUP_PRE_FLIGHT.md](BACKUP_PRE_FLIGHT.md) fully ticked and signed within 7 days
- [ ] **Backup Owner named:** ______

## C. Pharmacy information

- [ ] [PILOT_INTAKE_TEMPLATE.md](PILOT_INTAKE_TEMPLATE.md) complete
- [ ] Pilot agreement signed (personal data; no diagnoses in notes)
- [ ] Currency agreed (US$ / L$): ______ (**locks after the first sale**)
- [ ] Known limits explained ([launch workflow](FIRST_PHARMACY_LAUNCH_WORKFLOW.md#known-product-limits-to-set-expectations-early))

## D. Owner access

- [ ] Owner identity verified; provisioned; password set by the owner
- [ ] Onboarding done: Liberia, the agreed currency, name/phone/WhatsApp; starter list unticked
- [ ] `check-account.mjs`: owner · active · right pharmacy · LR · Africa/Monrovia
- [ ] Payment methods trimmed; **Walk-in Customer** created

## E. Staff access

- [ ] Each staff member: own email, invited, accepted, signed in on their own device
      ([STAFF_ONBOARDING_GUIDE.md](STAFF_ONBOARDING_GUIDE.md))
- [ ] Roles verified (`check-account.mjs` member list); staff don't see owner screens

## F. Data import

- [ ] Products imported; problems fixed ([DATA_IMPORT_GUIDE.md](DATA_IMPORT_GUIDE.md))
- [ ] Inventory imported (stock, batch, earliest expiry)
- [ ] Customers imported (optional; consenting customers only)
- [ ] Suppliers and prices entered by hand (top products; at least one product with 2+ prices)

## G. Inventory validation

- [ ] [OPENING_INVENTORY_RECONCILIATION.md](OPENING_INVENTORY_RECONCILIATION.md) complete
- [ ] **Owner signed off the opening stock;** opening Inventory export saved

## H. Training

- [ ] Owner trained ([OWNER_TRAINING_GUIDE.md](OWNER_TRAINING_GUIDE.md))
- [ ] Staff trained ([STAFF_QUICK_START.md](STAFF_QUICK_START.md)); each person did one practice
      sale
- [ ] Printed or shared: the staff quick start and the support contact

## I. Offline test

- [ ] [OFFLINE_TRAINING.md](OFFLINE_TRAINING.md) steps 1–10 passed **on every device**

## J. Support

- [ ] Support model and severity explained ([PILOT_SUPPORT_MODEL.md](PILOT_SUPPORT_MODEL.md))
- [ ] Pharmacy has the WhatsApp number and email saved; knows about the
      [issue template](SUPPORT_ISSUE_TEMPLATE.md)
- [ ] Operator cadence scheduled ([PILOT_OPERATING_CADENCE.md](PILOT_OPERATING_CADENCE.md))
- [ ] Stop conditions understood by the Operator and Incident Owner
      ([PILOT_STOP_CONDITIONS.md](PILOT_STOP_CONDITIONS.md))

## K. First transaction

- [ ] [FIRST_DAY_VALIDATION.md](FIRST_DAY_VALIDATION.md): all 19 tests passed; test stock
      restored
- [ ] First 3 **real** sales observed: stock went down and each sale appears once

## L. Go-live approval

☐ **A–K complete. The pharmacy is live on NevOut Meds for the controlled pilot.**

| Role | Name | Signature | Date |
|---|---|---|---|
| Pilot Operator | | | |
| Pharmacy Owner | | | |
| Incident Owner | | | |

## M. Day-1 review

- [ ] Health check at the end of the day: HEALTHY; sync failures 0; conflicts explained
- [ ] Sales recorded today (M1) versus the pharmacy's estimate: ___ / ___
- [ ] Every person sold on their own account (M2)
- [ ] Day-1 call held ([PILOT_FEEDBACK_PLAN.md](PILOT_FEEDBACK_PLAN.md#day-1-end-of-the-first-trading-day));
      issues logged with severities
- [ ] Decision: ☐ continue ☐ continue with fixes ☐ pause (stop condition: ___)
