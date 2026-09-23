# Country assumptions audit (Phase 9, Part A)

This is every place where NevOut Meds assumed it was running in Liberia, found by searching the
client, the migrations, the edge function and the tests for currency, phone, date, address,
payment and regulatory assumptions. Each one is classified and its Phase 9 outcome is recorded.

**Classes**

| Class | Meaning |
|---|---|
| **CONFIGURATION** | Varies by country or pharmacy. Moved into country or pharmacy configuration. |
| **BUSINESS RULE** | Logic that was silently tied to one country, such as a UTC business day or an unlabelled currency. Rewritten to be country-aware. |
| **COPY** | Words on screen. Changed only where they affect behaviour or mislead. |
| **TEST FIXTURE** | Synthetic test or demo data. Kept, because Liberia is still the default and the data is valid. |
| **LEGACY/REMOVE** | Dead code carrying the assumption. Deleted. |
| **REGULATORY RESEARCH REQUIRED** | Needs verified country rules. Not built, not guessed, and tracked in [REGULATORY_RESEARCH_BACKLOG.md](REGULATORY_RESEARCH_BACKLOG.md). |

## Money and currency

| # | Where | Assumption | Class | Phase 9 outcome |
|---|---|---|---|---|
| M1 | `client/src/platform/utils/format.ts` (`fmt`, `fmtK`), about 60 call sites | Every amount was prefixed with a bare `$` and formatted with `toFixed` (no digit grouping). | CONFIGURATION | `fmt`/`fmtK` now call `money()`, which uses the pharmacy's currency, locale and minor units. USD shows as **US$**, never a bare `$`, because Liberia also uses L$. |
| M2 | `purchases` table | Sales had no currency. `$` was implied. | BUSINESS RULE | Added `purchases.currency_code`. Existing rows are backfilled from the pharmacy (USD), new rows are stamped by a trigger, and the value can never be changed afterwards. |
| M3 | `supplier_catalogue.currency`, `purchase_orders.currency` (0001) | `default 'USD'` | CONFIGURATION | Default removed. A trigger fills in the pharmacy's currency and only accepts the country's own currencies plus USD. |
| M4 | `create_purchase_order(… p_currency default 'USD')` (0012/0015/0017) and its idempotent wrapper | USD orders | CONFIGURATION | Default is now `null`, which resolves to the pharmacy's currency. The client sends the currency of the quote the order was priced from. |
| M5 | `useCreatePurchaseOrder.ts`, `purchaseOrders.ts`, `suppliers.ts` | `p_currency: "USD"`, `?? "USD"` fallbacks | CONFIGURATION | Replaced by the quote's currency, or the pharmacy's. |
| M6 | `features/analytics/exports.ts` | `$` built into strings, plus a CSV of **invented figures** ("$4,820", "Cash on Hand $3,240") | LEGACY/REMOVE | Deleted (no callers). |
| M7 | `data/purchaseOrders.ts#createPurchaseOrder` | Non-idempotent PO path hard-coded to USD | LEGACY/REMOVE | Deleted (no callers; the idempotent path is used). |
| M8 | `features/suppliers/whatsapp.ts` saving helpers | `toFixed(2)` savings | LEGACY/REMOVE | Deleted (no callers). |
| M9 | Reports CSV exports | Money columns had no currency, and supplier totals were summed across currencies. | BUSINESS RULE | Every money export has a `currency` column. Supplier and order totals are grouped per currency. |
| M10 | `record_purchase` / PO price ceiling of 1,000,000 | Sized for USD | BUSINESS RULE | Raised to 100,000,000 so that low-value currencies (SLE, NGN, RWF) still validate. |
| M11 | Price Compare | Ranked every quote by number, whatever its currency. | BUSINESS RULE | Quotes are grouped by currency and never ranked against each other. A "best" flag appears only in a group that can be compared honestly. |

## Dates and time

| # | Where | Assumption | Class | Phase 9 outcome |
|---|---|---|---|---|
| D1 | `financial_summary`, `staff_performance` (0015) | Business day = UTC day (`date_trunc('day', now())`, `purchased_at::date`) | BUSINESS RULE | Both use the pharmacy's timezone, resolved on the server from the pharmacies row. They return `timezone` and `business_date`. |
| D2 | `record_purchase` `last_visit = now()::date` | UTC date | BUSINESS RULE | Uses `private.business_date(pharmacy)`. |
| D3 | `customers.registered_at` / `last_visit` defaults (0003) | UTC date | BUSINESS RULE | Defaults dropped. A trigger fills in the pharmacy's local date. |
| D4 | Client "today" helpers (Dashboard, Customers, Reminders, Sales, app shell, `todayISO`) | `new Date().toISOString().slice(0,10)`, which is the UTC date | BUSINESS RULE | All use `tenantToday()`, the pharmacy's business date. |
| D5 | `data/dashboard.ts` | Device-local midnight for "today", and a rolling 30×24 h window | BUSINESS RULE | Uses the pharmacy's business-day window, the same one the server uses, in the operating currency only. |
| D6 | `utils/dates.ts#daysUntilExpiry`, `utils/documents.ts#daysUntil` | Fractional days from the device clock | BUSINESS RULE | Whole calendar days from the pharmacy's business date. |
| D7 | `utils/dates.ts`, `utils/documents.ts` (`en-GB`, `en-US`), `StaffScreen` (`toLocaleDateString()` in the device locale) | Fixed or device locale | CONFIGURATION | `tenantDate` / `tenantDateTime` use the pharmacy's locale and timezone. Date-only values are never shifted by a timezone. |
| D8 | Dashboard greeting, date and WhatsApp daily summary (`summary.ts`) | Device hour and device date | CONFIGURATION | Use the pharmacy's timezone. |
| D9 | Admin console RPCs (0008–0010) | UTC days | BUSINESS RULE | **Kept in UTC on purpose.** They compare pharmacies across countries, so no single tenant's timezone applies. Documented in [TIMEZONE_MODEL.md](TIMEZONE_MODEL.md). |
| D10 | `documents.uploaded_at default now()::date` | UTC date | BUSINESS RULE | **Deferred.** Display-only, and at most one day off for UTC+3 pharmacies around midnight. Logged in the timezone model. |

## Phone, address, payments

| # | Where | Assumption | Class | Phase 9 outcome |
|---|---|---|---|---|
| P1 | `CustomersScreen` phone hint | "Include the country code, e.g. +231 for Liberia." | COPY / CONFIGURATION | `phoneHint(country)`, with the country's own example. |
| P2 | `features/customers/rules.ts` | A phone was the input with whitespace removed; no validation. | BUSINESS RULE | Numbers are parsed per country (calling code, trunk prefix, length) and stored in E.164. Existing records are never rewritten, and anything that doesn't parse is shown exactly as stored. |
| P3 | Supplier WhatsApp links (`whatsappLink`) | Digits only, so a local number such as "0770…" produced a broken `wa.me/0770…` | BUSINESS RULE | Adds the pharmacy's calling code (`whatsappDigits`). |
| A1 | `customers.county` + label "County / region" | Liberian counties | CONFIGURATION | Stable key `admin_area_1`, with a label per country (County, Region, State, Province, District). The column is unchanged, and Liberian data keeps working. |
| A2 | Onboarding "Country" free-text field; `pharmacies.country` free text | Anything typed | CONFIGURATION | Country-first `<select>` of supported countries → `pharmacies.country_code`. `country` is kept as a display column that the trigger keeps in step. |
| K1 | `record_purchase` method check (0011/0015); `purchases_method_allowed` CHECK; `SaleForm.METHODS` | The five Liberian methods, including Diaspora Pay | CONFIGURATION | The registry lists allowed and default methods per country, and `pharmacies.payment_methods` holds the owner's choice. `record_purchase` enforces the pharmacy's list, and the table CHECK now holds the global vocabulary of seven methods. Liberia keeps the same five, in the same order. |
| K2 | "Diaspora Pay" | Liberian remittance habit | CONFIGURATION | Available in Liberia only. |
| K3 | "Insurance" method | Implies insurance handling | REGULATORY RESEARCH REQUIRED | Kept as a **recorded label only**, with the hint "Recorded only — no claim is sent". No billing was built. |

## Copy, fixtures, legacy

| # | Where | Assumption | Class | Phase 9 outcome |
|---|---|---|---|---|
| C1 | `pages/HomePage.tsx` ("Liberia pilot", "+231 (placeholder)") | Marketing site describes the pilot | COPY | Kept. It describes the real pilot rather than product behaviour. Revisit when the marketing site targets other countries. |
| C2 | `supabase/functions/staff-admin` comment ("how most Liberian pilots work") | Comment | COPY | Kept. |
| L1 | `features/auth/LoginScreen.jsx` | Unused legacy login with a fictional "Monrovia Central Pharmacy" and "Liberia Pilot v2.0" | LEGACY/REMOVE | Deleted (no importers). |
| F1 | `platform/seed/*` (demo customers, suppliers, staff with +231 numbers, Monrovia) | Demo-mode data | TEST FIXTURE | Kept. Demo mode only; valid Liberian numbers. |
| F2 | E2E tests (+231 phones, US$ amounts, E2E Pharmacy A/B) | Liberian test tenants | TEST FIXTURE | Kept. The new pilots cover Ghana, Kenya and Rwanda. |

## Regulatory

| # | Where | Assumption | Class | Phase 9 outcome |
|---|---|---|---|---|
| R1 | Nowhere | No tax or VAT on sales | REGULATORY RESEARCH REQUIRED | Still no tax. Each profile marks tax as unverified, and Settings says so. No rates are shipped. |
| R2 | Nowhere | No pharmacy licence, pharmacist-in-charge or regulator fields | REGULATORY RESEARCH REQUIRED | Optional fields are stored in `pharmacies.regulatory`. Each is marked KNOWN (business registration, tax ID) or RESEARCH_REQUIRED (premises licence, pharmacist in charge). None are validated, required, printed or submitted. |
| R3 | Prescription-only flag on products | Rules for what needs a prescription | REGULATORY RESEARCH REQUIRED | Unchanged: it's a pharmacy-set flag with no enforcement engine, which is deliberate. |
