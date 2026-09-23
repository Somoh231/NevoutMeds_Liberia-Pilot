# Opening inventory reconciliation

**An imported spreadsheet is a claim, not a fact.**

Stock lists are often out of date, counted in different units (boxes vs strips vs tablets), or
missing expired and damaged items. Every forecast, low-stock alert, expiry warning and financial
figure in NevOut Meds builds on the opening stock. **Don't go live until the owner has signed it
off.**

When: after the Inventory import, **before the first real sale**. Ideally do it at closing time or
before opening, when nothing is being sold.

## 1. Prepare

1. The import finished with **0 rows not imported**, or every rejected row is fixed or
   deliberately left out.
2. On the owner's device: **Reports → Inventory → Export CSV.** This is the system count sheet
   (product, stock, value).
3. Print it, or open it on a second device. Add two columns: **Physical count** and
   **Difference**.
4. Agree the **counting unit** for each product: the unit you sell in (tablet, strip, bottle).
   This must match `unit` on the product.

## 2. Choose what to count

For a pharmacy with fewer than about 300 products, count **everything**. For more, count at
least these samples:

| Sample | Which | Why |
|---|---|---|
| **High value** | The 20 products with the highest *value in stock* (Inventory → sort by **Most value in stock**) | Mistakes here distort money figures most |
| **Fast moving** | The 20 products the owner says sell most | They drive reorder alerts and run out first |
| **Expiry-sensitive** | Everything the Expiry screen shows within 90 days | Expired stock must not be counted as sellable |
| **Random** | 10 more, picked at random | Catches systematic errors (a wrong unit for a whole category) |

## 3. Count and compare

For each counted product:

1. Count what is physically there **and sellable**. Put expired or damaged stock aside and don't
   count it.
2. Difference = **physical − system**.
3. Check the **expiry date** on the shelf against the app. It should be the **earliest** batch.
4. Note obvious unit mistakes (the system says 1,000 and the shelf has 100 strips of 10).

## 4. Decide whether the import is trustworthy

| Result of the sample | Decision |
|---|---|
| All counted products match, or are within ±2 units on low-value items | Accept. Correct the differences found (step 5). |
| More than **10%** of sampled products differ, or **any** unit mistake | **Don't correct one by one.** Fix the source file (units, counts), re-import Inventory (it **sets** stock), and sample again. |
| High-value products differ | Count **all** high-value products, not a sample |

## 5. Correct the differences

- **Before go-live, while nothing is being sold:** re-import a corrected Inventory file (quickest
  for many rows), or use **Inventory → Adjust stock** with reason **Stock count correction** and
  ` – opening count` typed after it in the note box. The reason button fills the note, so type after it rather than replacing it (best for a few rows; the history shows the correction).
- **Enter the change, not the total.** The system says 40 and you counted 36 → enter **−4**.
- **Expiry dates:** correct them with a one-product Inventory re-import (see
  [DATA_IMPORT_GUIDE.md §3](DATA_IMPORT_GUIDE.md#3-inventory-opening-stock)).
- Expired or damaged stock found: if it was counted in the import, remove it with **Adjust stock**,
  reason **Damaged or expired**.

## 6. Sign-off

After corrections, export Reports → Inventory again and keep it: it is the **opening stock
record** for the pilot.

| | |
|---|---|
| Products in system | |
| Products counted | |
| Products corrected | |
| Largest correction (product, units) | |
| Total stock value at cost after corrections | |
| Counting unit problems found? | ☐ No ☐ Yes, fixed: ______ |

☐ **I confirm the opening stock in NevOut Meds reflects the sellable stock in my pharmacy on
this date.**

Owner: ______________ Date: ______ · Operator: ______________

## 7. After go-live

- **Weekly for the first 2 weeks:** count 10 fast-moving products and compare. A growing gap
  means sales are not being recorded, or deliveries are not being entered. Raise it at the weekly
  review.
- Deliveries are **not** added automatically from purchase orders: always use **Adjust stock →
  Delivery received**.
