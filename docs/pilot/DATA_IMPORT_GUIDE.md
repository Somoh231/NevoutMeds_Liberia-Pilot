# Data import guide

This describes the **actual** importer: owner-only, under Management → **Import data**
(`/import`). Every rule below is checked by the automated test `supabase/tests/ui_import.e2e.mjs`.

**Import order:**
1. **Products**;
2. **Inventory** (stock, batch, expiry: it needs the products to exist first);
3. **Customers** (optional).

Suppliers can't be imported; see §5.

Templates with synthetic example rows are in [`templates/`](templates/):
- [`products_template.csv`](templates/products_template.csv)
- [`inventory_template.csv`](templates/inventory_template.csv)
- [`customers_template.csv`](templates/customers_template.csv)

Delete the `SAMPLE` rows before using them.

## 1. Rules for every import

| Rule | Detail |
|---|---|
| **Formats** | `.csv` (UTF-8) or `.xlsx`. For `.xlsx`, only the **first sheet** is read. Old `.xls` is **not** accepted: save it as `.xlsx` or CSV. |
| **Limits** | 5 MB per file, the first 5,000 rows, 64 columns, 500 characters per cell. Split bigger files. |
| **Header row** | Row 1 holds the column names. They are **not case-sensitive**, and spaces or hyphens count as underscores (`Unit Cost` = `unit_cost`). Extra columns are ignored. |
| **Numbers** | Plain numbers: `12`, `12.50`, `1,200`. **No currency symbols** (`$5.00` and `L$500` are rejected, never saved as 0). |
| **Whole numbers** | `stock`, `reorder_point` and `max_stock` must be whole numbers ≥ 0 |
| **Dates** | Write them `YYYY-MM-DD` (`2027-03-31`). In Excel, a real date cell is also fine. A typed date like `31/12/2027` is **rejected**, because day/month order can't be guessed safely. |
| **Preview** | After choosing a file you see the first 12 rows. **Nothing is saved until you press Import.** |
| **Missing required columns** | The Import button doesn't appear; the message lists the missing columns |
| **Bad rows** | Rows with problems are **skipped**, and every other row is imported. The orange box lists each problem **with its spreadsheet row number** (header = row 1), grouped by reason. Fix those rows and import the file again. |
| **Result** | "Import finished: N row(s) added or updated · M not imported" |
| **Same key twice in one file** | The later row is rejected as "same … as row N". The first one is used. |
| **Repeating an import** | This is safe. See each section for what "already exists" means. |
| **Offline** | Import needs a connection |

## 2. Products

| Column | Required | Meaning |
|---|---|---|
| `name` | **yes** | Product name as the pharmacy says it, including the strength: `Paracetamol 500mg`. **This is the product's identity.** |
| `category` | **yes** | Free text: `Analgesic`, `Antibiotic`, … |
| `unit_cost` | **yes** | What the pharmacy pays per selling unit, in the pharmacy's currency |
| `selling_price` | **yes** | Shelf price per selling unit, in the pharmacy's currency |
| `brand` | no | |
| `unit` | no | The selling unit: `tablet (strip of 10)`, `bottle 100ml` |
| `reorder_point` | no (0) | Low-stock warning level. **Strongly recommended:** without it there are no low-stock alerts. |
| `max_stock` | no (0) | Used for suggested reorder quantities |
| `daily_velocity` | no (0) | Average sold per day; used for "days of stock". It can be left at 0 and set later. |

**Currency:** prices are recorded in the pharmacy's currency (US$ or L$) as chosen at onboarding.
Don't mix currencies in one file.

**Already exists** means a product with **exactly the same name**, including capital letters.
You choose what happens:
- **"Update them with the values in the file"** (the default) overwrites category, cost, price
  and the optional fields;
- **"Leave them unchanged; only add new ones"** doesn't touch existing products.

**Not importable:** the prescription-only flag. It can only be set when a product is added by
hand (Inventory → Add product).

**Changing products later.** The app has **no product edit screen**. To change a price, cost,
reorder level or category after setup:
1. export or keep the products file;
2. change the rows;
3. re-import them with **"Update them with the values in the file"**.

Only the owner can do this. Stock is never changed by a products import.

## 3. Inventory (opening stock)

| Column | Required | Meaning |
|---|---|---|
| `product_name` | **yes** | Must match an existing product name (capitals don't matter here) |
| `stock` | **yes** | Quantity **on the shelf now**, in selling units. A blank cell is rejected, never set to 0. |
| `batch_id` | no | |
| `expiry_date` | no | `YYYY-MM-DD` |

- **Each row SETS the stock to that number.** It does not add to it. Importing the same file twice
  gives the same stock, not double.
- **Every change is recorded** as a stock movement with the note "stock import", so the audit
  trail stays complete.
- **One batch and one expiry date per product.** NevOut Meds keeps one expiry per product, so use
  the **earliest** expiry for products with several batches.
- **An unknown product name** is reported as "no product named …". Fix the spelling, or import
  the product first.
- **After go-live**, change stock only through **Inventory → Adjust stock** (deliveries, damage,
  count corrections), never by re-importing.
- **Correcting a batch or expiry after go-live.** The app has no other way to edit these, so
  re-import is the only route. Because a row also **sets stock**, follow these steps:
  1. put **only that product** in the file;
  2. copy its stock **exactly as the Inventory screen shows it right now**;
  3. import when no sale is being recorded on any device.

## 4. Customers (optional)

Import only customers who agreed to be recorded under the pilot agreement.

| Column | Required | Meaning |
|---|---|---|
| `first_name` | **yes** | |
| `last_name` | **yes** | |
| `phone` | **yes** | Any Liberian format: `0770 123 456`, `+231 77 012 3456`, `231770123456`. It is stored as `+231…`, and an invalid number is rejected with the reason. **In Excel, format the phone column as Text** so a leading 0 or `+` isn't lost. |
| `community` | no | |
| `county` | no | |
| `landmark` | no | |
| `credit_limit` | no (0) | Maximum credit balance; 0 = no limit set |

- **Already exists** means the same phone number, however it was written. "Update" overwrites
  name, community, county, landmark and credit limit; "Leave unchanged" skips them.
- **Not importable, on purpose:** allergies, conditions, date of birth and notes. Record these
  only in the app, only if the customer shares them, and **never diagnoses in notes**.

### 4.1 The walk-in customer (required for counter sales)

Every sale in NevOut Meds is recorded against a customer. For people you don't register:
1. In **Customers → Register customer**, create:
   - first name `Walk-in`;
   - last name `Customer`;
   - phone = **the pharmacy's own phone number**;
   - credit limit `0`.
2. At the counter, choose **Walk-in Customer** for anonymous sales.
3. **Never use the Credit payment method with Walk-in Customer.** Nobody can repay it.

## 5. Suppliers: no import; set up by hand

Suppliers and supplier prices **can't be imported**. Enter them by hand. This needs a
connection.

1. **Suppliers → Add supplier:**
   - supplier name;
   - WhatsApp and/or phone (used to open orders in WhatsApp);
   - city or town;
   - country;
   - usual lead time in days;
   - payment terms.
2. **Suppliers → Record a price** for each product the supplier sells:
   - supplier, product, unit price, currency (the pharmacy's own or US$);
   - minimum order and availability.
   - **Only the latest price per supplier and product is kept.**
3. Start with the pharmacy's **top 20 products** by sales. Price Compare only helps where 2 or
   more suppliers have a price for the same product.

## 6. Preparing a pharmacy's existing spreadsheet

1. Copy the template's header row into the pharmacy's sheet, then map their columns onto it.
2. Remove currency symbols: in Excel, use Find & Replace `$` → nothing.
3. Put strength into the name (`Amoxicillin 250mg`), so products with different strengths stay
   separate.
4. Check for the same product listed twice. The importer keeps the first and reports the rest.
5. Save as `.xlsx`, or as **CSV UTF-8** (Excel: File → Save As → "CSV UTF-8").
6. Import. Read the orange box, fix the listed rows, and import again: fixed rows are added,
   and rows already imported are updated with the same values.
7. Then reconcile ([OPENING_INVENTORY_RECONCILIATION.md](OPENING_INVENTORY_RECONCILIATION.md)).
   **An imported spreadsheet is not proof that stock is correct.**
