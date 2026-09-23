# Pilot success metrics

A small set of metrics, each tied to a decision. **Source** says where the number comes from:
- **DB**: the read-only queries in [`ops/monitor/pilot-metrics.sql`](../../ops/monitor/pilot-metrics.sql)
  (M1–M8, tested against the schema), or the health check;
- **Manual**: from counts, logs or interviews;
- **Not instrumented**: needs future work, so it is measured by hand in this pilot.

Run the queries in the Supabase SQL editor with the pharmacy's exact name. They only read.

**Baseline:** record the intake-form answers (sales per day, stock method, known stockouts and
expiries) **before go-live**, so Week 2 has something to compare against.

## Reliability: "Can the pharmacy trust it?"

| Metric | Definition | Source | Target (2 weeks) |
|---|---|---|---|
| **Successful sale rate** | sales saved ÷ (sales saved + sales refused by the server) | DB M4: `sales_saved`, `sales_refused` | ≥ 99% |
| **Sync failures** | Device-reported sends that failed 3+ times | DB M4 `sync_failures`; health check | 0 unresolved per day |
| **Conflicts** | Changes the server refused ("Needs attention"), and how many the pharmacy cleared | DB M4 `conflicts_all`, `conflicts_cleared` | Every conflict explained; none open more than 1 working day. Open ones live only on the device, so ask at the reviews. |
| **Application errors** | Client errors logged (excluding sync and storage) | DB M4 `app_errors`; health check | No error repeating more than twice |
| **Integrity** | Negative stock, duplicate sales, unstamped sales, stock ≠ movements | Health check (`ops_health`) | **Always 0**. Otherwise see [PILOT_STOP_CONDITIONS.md](PILOT_STOP_CONDITIONS.md). |
| **Backups** | Age of the last successful database and storage backup | Health check | < 26 h, every day |

## Adoption: "Do they actually use it?"

| Metric | Definition | Source | Target |
|---|---|---|---|
| **Active days** | Business days with at least 1 sale recorded | DB M1 | Every trading day after day 2 |
| **Transactions recorded** | Sales per day, compared with the intake estimate | DB M1 `sales`; baseline | ≥ 80% of the estimated daily sales by week 2 |
| **Inventory adjustments** | Stock changes by reason (delivery, damage/expiry, correction, return) | DB M3 | Deliveries entered on every delivery day |
| **Staff usage** | Each person's sales and stock changes, and when they were last seen | DB M2 | Every staff member records sales on their own account |
| **Feature use** | Screens opened, per person | DB M8 | Informs which features matter; there is no target |

## Operational value: "Does it help run the pharmacy?"

| Metric | Definition | Source | Notes |
|---|---|---|---|
| **Stockouts identified** | Products out of stock or at/below their reorder level; products with **no** reorder level | DB M7 | Snapshot. "Stockouts **prevented**" is **not instrumented**: ask at the reviews for concrete cases, and check them against the data. |
| **Expiry value surfaced** | Value at cost of stock expired / within 30 days / 30–90 days | DB M5 | Week 2: how much of the week-1 "within 30 days" value was sold or written off rather than lost |
| **Supplier savings opportunities** | Products with 2+ supplier prices in the same currency, and the price gap per unit | DB M6 | Only as good as the prices recorded. Ask whether an order used the cheaper supplier. |
| **Time to record a sale** | Seconds from "New sale" to "Sale recorded" | **Not instrumented.** Stopwatch 5 sales on day 1 and in week 2. | Target: comparable to, or faster than, their current method |
| **Inventory discrepancy** | Share of 10 counted fast movers where physical ≠ system | **Manual** weekly recount ([OPENING_INVENTORY_RECONCILIATION.md §7](OPENING_INVENTORY_RECONCILIATION.md#7-after-go-live)), plus DB M3 "Stock count correction" units | Falling or ≤ 10% by week 2 |

## Support: "Is the pilot sustainable to support?"

| Metric | Definition | Source | Target |
|---|---|---|---|
| **Issues per user** | Support reports ÷ active users, per week | Manual: incident and feedback logs | Falling from week 1 to week 2 |
| **Severity mix** | Count of P0 / P1 / P2 / P3 | Manual | **0 P0**; P1 ≤ 1 per week |
| **Time to resolution** | Report → resolved or worked around, per severity | Manual | Within [PILOT_SUPPORT_MODEL.md](PILOT_SUPPORT_MODEL.md) targets |
| **In-app feedback** | Items and average quick rating | DB M8 (second query) | Rating ≥ 4 |

## User value: "Would they keep it?"

| Metric | Question (asked at the week-2 review) | Target |
|---|---|---|
| **Helps decisions** | "Name a decision NevOut Meds helped you make." (Needs a concrete example.) | ≥ 1 real example |
| **Staff independence** | Can staff do sales, customers, adjustments and reminders without help? (Watch them, don't ask.) | Yes for every staff member |
| **Willingness to continue** | Continue after the pilot? Pay US$__/month? | Yes / yes, with the price noted |
| **Recommendation** | 0–10: recommend it to another pharmacy owner? | ≥ 8 |

## How the metrics decide the outcome

| Outcome | When |
|---|---|
| **Continue / expand** | Reliability targets met, the pharmacy is active on most days, staff are independent, and the owner wants to continue |
| **Continue with fixes** | Reliability met, but adoption or value is limited by known gaps (walk-in, credit repayments, product edit). Prioritise those. |
| **Stop / rethink** | Any stop condition, **or** little use after week 1 despite support, **or** the owner sees no value |

**Not measured, on purpose:** logins, page views as "engagement", or anything else that could look
good without the pharmacy being better off.
