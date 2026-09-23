# First-pharmacy launch workflow

This is the end-to-end path from "a pharmacy agreed to pilot" to "two weeks of live use".
Each stage names who does it, what "done" means, and the document with the detail.

App: `https://nevout-meds-liberia-pilot.vercel.app` · Roles: **Pilot Operator** (runs
onboarding), **Incident Owner (TBD)**, **Backup Owner (TBD)**, **Technical Support** (engineer,
escalation only).

> **Hard gate:** no real pharmacy, customer or patient data goes in until
> [BACKUP_PRE_FLIGHT.md](BACKUP_PRE_FLIGHT.md) is fully ticked.

```
PRE-ONBOARDING ─► ACCOUNT SETUP ─► CONFIGURATION ─► DATA SETUP ─► TRAINING ─► GO-LIVE ─► POST-LAUNCH
   (days −10…−3)     (day −2)          (day −2)        (days −2…−1)  (day −1)    (day 0)    (days 1–14)
```

## 1. Pre-onboarding (about 1 week before)

| Step | Who | Done when |
|---|---|---|
| **1.1 Qualify the pharmacy.** Proceed only if all of these are true: it is in Liberia; it sells from stock daily; it has at least one Android phone, tablet or laptop with a current Chrome, Edge or Safari; the owner will give ~2 hours for setup and training and a few minutes a day during the pilot; and it accepts that this is a pilot. | Operator | The owner agrees in principle |
| **1.2 Pilot agreement signed.** It must cover: storing customer names, phones and purchase history; no diagnoses in notes; pilot duration; the support channel; and that there is no charge during the pilot (unless agreed otherwise). | Operator + owner | Signed copy filed |
| **1.3 Intake form completed** ([PILOT_INTAKE_TEMPLATE.md](PILOT_INTAKE_TEMPLATE.md)) | Operator with owner | All required fields filled |
| **1.4 Send the data templates** (`templates/*.csv`) and the [DATA_IMPORT_GUIDE.md](DATA_IMPORT_GUIDE.md) summary | Operator | The owner has them and knows the deadline (day −3) |
| **1.5 Identify users.** Name the one owner and each staff member, each with **their own email address**. No shared accounts. | Operator | The list is in the intake form |
| **1.6 Check devices and network.** On each device, the app loads on the pharmacy's usual connection, and the device can be charged at the counter. | Operator (on site or video call) | Tick in the intake form |
| **1.7 Backup prerequisite confirmed.** [BACKUP_PRE_FLIGHT.md](BACKUP_PRE_FLIGHT.md) is complete, with a scheduled backup **and** restore test in the last 7 days. | Backup Owner (TBD) | **Signed. Otherwise stop here.** |

## 2. Account setup (day −2, about 30 minutes)

| Step | How | Done when |
|---|---|---|
| **2.1 Provision the owner** | [OWNER_PROVISIONING_GUIDE.md](OWNER_PROVISIONING_GUIDE.md) while SMTP is unavailable. Once SMTP is live, the owner signs up at `/login`. | The owner receives the setup link over their verified WhatsApp |
| **2.2 The owner sets their own password** | Opens the link and chooses a password (8+ characters) | Lands on "Set up your pharmacy" |
| **2.3 The pharmacy is created.** The owner completes onboarding, which creates the pharmacy and makes them its owner. | [Section 3](#3-configuration-day-2-same-session) | The dashboard shows the pharmacy name |
| **2.4 Verify the owner's access** | The owner signs out and back in. The operator runs `node ops/provision/check-account.mjs --email <owner>`. | `role: owner · status: active`, with the right pharmacy, LR and currency |
| **2.5 Staff accounts** | [STAFF_ONBOARDING_GUIDE.md](STAFF_ONBOARDING_GUIDE.md): the owner invites, and staff accept | Each staff member signs in and sees the pharmacy name |
| **2.6 Verify roles** | `check-account.mjs --email <owner>` lists every member and role | Owner = owner and staff = staff; no unexpected members |

## 3. Configuration (day −2, same session)

The owner does this in onboarding and then **Settings**, with the operator watching.

| Item | Where | Rule |
|---|---|---|
| Pharmacy name, phone, WhatsApp, city/town, address | Onboarding, then Settings → General / Contact | This is the name staff and suppliers see |
| **Country = Liberia** | Onboarding (first question) | This sets the business day (Africa/Monrovia), the phone format and the payment methods |
| **Currency: US$ or L$** | Onboarding → "Currency you sell in" | **Decide before the first sale; it locks after that.** Use whatever the shelf prices are written in. |
| Payment methods | Settings → Money | The Liberia defaults are Cash, Mobile Money, Credit, Insurance and Diaspora Pay. Remove any the pharmacy doesn't take. |
| Starter medicine list | Onboarding checkbox | **Leave it unticked** when importing the pharmacy's own list; it adds 8 medicines at price 0 |
| Suppliers | Suppliers → Add supplier (needs a connection) | See [DATA_IMPORT_GUIDE.md §5](DATA_IMPORT_GUIDE.md#5-suppliers-no-import-set-up-by-hand) |
| Walk-in customer | Customers → Register customer | See [DATA_IMPORT_GUIDE.md §4.1](DATA_IMPORT_GUIDE.md#41-the-walk-in-customer-required-for-counter-sales) |

## 4. Data setup (days −2 to −1)

| Step | Detail | Done when |
|---|---|---|
| **4.1 Clean the pharmacy's files** | Check them against the templates and fix problems before importing | The files match the templates |
| **4.2 Import products** | Import data → Products | "Import finished", with 0 rows not imported (or each one explained) |
| **4.3 Import stock** | Import data → Inventory (after products) | Same as 4.2 |
| **4.4 Import customers** (optional) | Import data → Customers | Same as 4.2 |
| **4.5 Suppliers and prices** | Entered by hand | Each regular supplier exists; the top 20 products have at least one supplier price |
| **4.6 Reconcile the opening stock** | [OPENING_INVENTORY_RECONCILIATION.md](OPENING_INVENTORY_RECONCILIATION.md) | **The owner signs off the opening stock** |
| **4.7 Reminders** (optional) | Reminders → New reminder, for known regular refill customers | Entered, or skipped |

## 5. Training (day −1, about 90 minutes in total)

| Session | Material | Length |
|---|---|---|
| Owner walkthrough | [OWNER_TRAINING_GUIDE.md](OWNER_TRAINING_GUIDE.md) | 45 min |
| Staff quick start | [STAFF_QUICK_START.md](STAFF_QUICK_START.md) | 20 min |
| Offline exercise, everyone on their own device | [OFFLINE_TRAINING.md](OFFLINE_TRAINING.md) | 15 min |
| How to get help | [PILOT_SUPPORT_MODEL.md](PILOT_SUPPORT_MODEL.md), plus Help & feedback in the app | 5 min |

## 6. Go-live (day 0)

1. **Final validation:** every test in [FIRST_DAY_VALIDATION.md](FIRST_DAY_VALIDATION.md) passes.
2. **Pilot approval:** the Operator and the owner sign section L of
   [PILOT_LAUNCH_MASTER_CHECKLIST.md](PILOT_LAUNCH_MASTER_CHECKLIST.md).
3. **Controlled first transactions:**
   - the first 3 real sales are made with the operator present or on a call;
   - after each one, check that the stock went down and the sale shows in Sales and on the
     Dashboard.
4. **Monitoring on:** the health check runs and someone reads it
   ([PILOT_OPERATING_CADENCE.md](PILOT_OPERATING_CADENCE.md)).

## 7. Post-launch reviews

| When | Focus | Material |
|---|---|---|
| Day 1 | Access, stock correctness, sales, confidence offline | [PILOT_FEEDBACK_PLAN.md](PILOT_FEEDBACK_PLAN.md) |
| Day 3 | Friction, missing information, support issues | Same |
| Week 1 | Adoption, stock accuracy, purchasing, reports | Same, plus [PILOT_SUCCESS_METRICS.md](PILOT_SUCCESS_METRICS.md) |
| Week 2 | Value, whether to continue or pay, priorities | Same |

At any point, [PILOT_STOP_CONDITIONS.md](PILOT_STOP_CONDITIONS.md) overrides this plan.

## Known product limits to set expectations early

Say these to the owner on day −2 so they don't come as surprises:

| Limit | What to do in the pilot |
|---|---|
| **Every sale needs a customer.** There is no anonymous "walk-in" option. | Create one **Walk-in Customer** record and use it for counter sales ([DATA_IMPORT_GUIDE.md §4.1](DATA_IMPORT_GUIDE.md#41-the-walk-in-customer-required-for-counter-sales)). **Never sell on Credit to Walk-in.** |
| **Credit repayments can't be recorded.** Credit balances only grow. | Keep using the pharmacy's current credit book for repayments. Use "Credit" sparingly, and note it as feedback. |
| **Deliveries aren't received against purchase orders.** | When goods arrive: Inventory → Adjust stock → reason "Delivery received" |
| **One batch and one expiry date per product** | Record the **earliest** expiry for each product |
| **Only the latest supplier price is kept** | Record a new price whenever a supplier quotes one |
| **No screen to edit an existing product** (price, cost, reorder level, expiry) | The owner re-imports the changed rows with "Update" ([DATA_IMPORT_GUIDE.md §2](DATA_IMPORT_GUIDE.md#2-products)). Set prices carefully at import. |
| **Password reset by email isn't available yet** (SMTP open) | See [OWNER_PROVISIONING_GUIDE.md](OWNER_PROVISIONING_GUIDE.md#what-to-do-if) |
