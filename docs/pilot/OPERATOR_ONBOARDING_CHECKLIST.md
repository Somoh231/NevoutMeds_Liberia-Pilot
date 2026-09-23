# Operator onboarding checklist

Use this during the onboarding call or visit. It follows the
[launch workflow](FIRST_PHARMACY_LAUNCH_WORKFLOW.md). App:
`https://nevout-meds-liberia-pilot.vercel.app`.

Pharmacy ref: ______ · Date: ______ · Operator: ______

## Before the call

- [ ] [BACKUP_PRE_FLIGHT.md](BACKUP_PRE_FLIGHT.md) signed within the last 7 days. **Stop if not.**
- [ ] Health check is HEALTHY: `node ops/monitor/health-check.mjs`
- [ ] Intake form complete; pilot agreement signed; owner identity verified
- [ ] Pharmacy data files received and checked against the templates
- [ ] Your machine has `NEVOUT_SUPABASE_URL` and `NEVOUT_SERVICE_ROLE_KEY_FILE` (chmod 600). **Never
      share the screen while that file or terminal output is visible.**
- [ ] Support WhatsApp number and email are ready to give to the pharmacy

## During setup

- [ ] Provision the owner (`provision-owner.mjs … --yes`) and send the link **only** to the
      verified WhatsApp ([OWNER_PROVISIONING_GUIDE.md](OWNER_PROVISIONING_GUIDE.md))
- [ ] The owner sets their own password. You don't see it or type it.
- [ ] Onboarding:
  - [ ] Country **Liberia**, currency **as agreed** (locked after the first sale)
  - [ ] Pharmacy name, phone and WhatsApp
  - [ ] Starter list **unticked**
- [ ] Settings → Money: remove payment methods the pharmacy doesn't take
- [ ] Create **Walk-in Customer**: the pharmacy's own phone, credit limit 0

## Owner access test

- [ ] The owner signs out, then signs in again on their own device
- [ ] The header shows the correct pharmacy name
- [ ] `node ops/provision/check-account.mjs --email <owner>` →
      `role: owner · status: active`, pharmacy correct, `LR`, currency correct, business day
      `Africa/Monrovia`
- [ ] The owner sees the Insights and Management groups (Financials, Analyst, Reports, Staff,
      Documents, Import data, Settings)

## Staff access test

- [ ] The owner invites each staff member (Staff → Invite a team member) and sends the link over
      WhatsApp ([STAFF_ONBOARDING_GUIDE.md](STAFF_ONBOARDING_GUIDE.md))
- [ ] Each staff member signs in **on their own device** and sees the same pharmacy name
- [ ] Staff do **not** see Financials, Analyst, Reports, Staff, Documents, Import data or
      Settings
- [ ] `check-account.mjs --email <owner>` lists every member with the expected role; no strangers,
      no expired invitations left open

## Data import

- [ ] Products imported. Result: ___ added · ___ not imported (each one explained or fixed)
- [ ] Inventory imported. Result: ___ updated · ___ not imported
- [ ] Customers imported (optional). Result: ___ · ___
- [ ] Spot check: 5 random products show the right price, stock and expiry in Inventory

## Inventory reconciliation

- [ ] Follow [OPENING_INVENTORY_RECONCILIATION.md](OPENING_INVENTORY_RECONCILIATION.md) (sample
      count, corrections through Adjust stock)
- [ ] **The owner signs off the opening stock**

## Offline test

- [ ] Every device: online sign-in, then [OFFLINE_TRAINING.md](OFFLINE_TRAINING.md) steps 1–9
      with a test sale on a **TEST product** (see the validation doc). "Waiting to sync" then
      "Synced" is seen on each device.

## First sale test

- [ ] One sale through Sales → New sale: Walk-in Customer, 1 item, Cash → "Sale recorded ·
      Synced"
- [ ] Stock for that product went down by 1 (Inventory)
- [ ] The sale shows in Latest sales today and on the Dashboard
- [ ] Reverse the test stock: Adjust stock **+1**, reason "Stock count correction", adding
      " – onboarding test sale" after it in the note box

## Supplier / price compare setup

- [ ] Regular suppliers added (name, WhatsApp, lead time)
- [ ] Prices recorded for the top products; at least one product has 2+ suppliers
- [ ] Suppliers → Price compare shows a ranked list for that product

## Reports test

- [ ] Reports → Sales (7 days) shows the test sale; **Export CSV** opens in a spreadsheet
- [ ] Reports → Inventory shows stock value by category
- [ ] Dashboard "Needs attention" makes sense (low stock, expiry) and nothing looks invented

## Support contact

- [ ] The pharmacy has the support WhatsApp number and email saved in their phone
- [ ] Shown: Help & feedback in the account menu (Report issue / Request feature)
- [ ] Explained: what counts as urgent (P0/P1) and what to send
      ([SUPPORT_ISSUE_TEMPLATE.md](SUPPORT_ISSUE_TEMPLATE.md))

## Go-live approval

- [ ] [FIRST_DAY_VALIDATION.md](FIRST_DAY_VALIDATION.md): every item passes
- [ ] Section L of [PILOT_LAUNCH_MASTER_CHECKLIST.md](PILOT_LAUNCH_MASTER_CHECKLIST.md) signed
      by the operator and owner

## After launch

- [ ] Day 1 call booked (end of the first trading day)
- [ ] Day 3 and Week 1 / Week 2 reviews booked ([PILOT_FEEDBACK_PLAN.md](PILOT_FEEDBACK_PLAN.md))
- [ ] Daily cadence started ([PILOT_OPERATING_CADENCE.md](PILOT_OPERATING_CADENCE.md))
- [ ] Onboarding notes saved: import results, open questions, anything the owner was unhappy
      with
