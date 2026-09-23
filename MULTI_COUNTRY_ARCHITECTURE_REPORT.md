# Phase 9: multi-country, multi-currency and localization report

Branch: `phase8/ux-design-system`. Migration: `0018_country_tenant_model.sql`.
Supporting documents are in [docs/country/](docs/country/README.md).

## Summary

NevOut Meds treated "Liberia" as an assumption: a bare `$`, the UTC day, `+231` hints, five
hard-coded payment methods and a free-text country. It now treats the country as
**configuration**, which covers:

- a server-side country registry;
- per-pharmacy country, currency, timezone, locale and payment methods;
- currency stamped on every money record and never converted;
- business days in the pharmacy's own timezone, decided by the server;
- country-aware phone, address and payment entry;
- country-first onboarding and an owner Settings screen.

Seven countries are configured: LR, SL, GH, NG, GM, KE, RW. Ghana, Kenya and Rwanda passed
synthetic pilots.

**Liberia behaves exactly as before**: USD, the Africa/Monrovia day (UTC+0, so every date is
unchanged), and the same five payment methods in the same order. The one deliberate visible
change is that money reads **US$12.50** instead of **$12.50**. In Liberia, `$` alone is
ambiguous, because the Liberian dollar is also a "dollar".

Not built (per scope): live FX, payment-provider integrations, tax calculation or filing,
government reporting, insurance billing, prescription rules. Regulatory questions are listed,
not answered, in the [research backlog](docs/country/REGULATORY_RESEARCH_BACKLOG.md).

## Architecture

### 1. One registry, enforced on the server, mirrored on the client

- **`private.country_rules`** lists allowed currencies, timezones, locales and payment methods
  (plus defaults) for each country. Only security-definer code can read it.
- **`client/src/platform/country/`** mirrors those facts as `CountryProfile` data, and adds
  presentation data:
  - phone rules
  - address labels
  - regulatory field certainty
  - the tax note
- A unit test parses the migration and fails if the two ever disagree.
- Screens call helpers (`money`, `tenantToday`, `getPaymentMethods`, `getAddressFields`,
  `parsePhone`…). There are no `if (country === …)` branches anywhere.

### 2. Tenant configuration on `pharmacies`

- **New columns:** `country_code`, `default_currency`, `timezone`, `locale`, `payment_methods`,
  `address_fields` and `regulatory`.
- **Backfill:** existing rows become LR / USD / Africa/Monrovia / en-LR.
- **Validation:** the `pharmacies_validate_config` trigger validates every insert and update
  against the registry and fills blanks from the country.
- **Country switch:** before any sale, changing the country resets currency, timezone, locale and
  methods to the new country's defaults.
- **Lock:** `country_code` and `default_currency` are locked **once a sale exists** (SQLSTATE
  `55000`).
- **Audit:** every change is logged to `pharmacy_config_changes`, which only the owner or admin
  can read.
- **Write path:** authenticated users can't write the new columns directly. Changes go through
  `update_pharmacy_settings` (owner only, allow-listed keys) or `onboard_pharmacy`.

### 3. Money

| Decision | Detail |
|---|---|
| Stamp, never convert | Sales (`purchases.currency_code`), supplier prices and orders carry their currency. Stamps are applied by triggers and are immutable once recorded. |
| One operating currency | Product prices, balances and stock value use `default_currency`. A sale priced in any other currency is a **409 conflict**, including one queued offline before a change. |
| No floating point in authority | Values are Postgres `numeric` and totals are computed by the server. The client only formats and rounds input to minor units as strings. |
| Ambiguity-safe symbols | US$, L$, Le, GH₵, ₦, D, KSh, FRw. Unknown codes are shown as the code. Minor digits follow ISO 4217 (RWF has none). |
| Segmented reporting | `financial_summary` totals only the operating currency and returns `other_currencies` separately. Reports and Financials show those as a separate notice. Every CSV money column has a `currency` column. |
| Price Compare | Quotes are grouped per currency and never ranked across currencies. The recommendation comes only from a group that can be compared honestly. An order is placed in the quote's currency. |

### 4. Time

- **Business date** = the calendar day in `pharmacies.timezone`. The **server resolves it from
  the pharmacy row** and never accepts a timezone from the client.
- **What was de-UTC'd:**
  - `financial_summary`, `staff_performance`, `last_visit`, customer registration dates;
  - on the client: every "today", the dashboard window, expiry countdowns, greeting and dates.
- **Library cost:** none. `Intl` supplies zone offsets.
- **Exceptions:** the admin console stays in UTC as a cross-tenant view. `documents.uploaded_at`
  is deferred (display-only).

### 5. Phone, address and payments

| Area | Approach |
|---|---|
| Phone | Custom rules per country: calling code, trunk prefix, national-number lengths, grouping. New numbers are stored in E.164. Legacy values are shown exactly as stored. `wa.me` links get the calling code. `libphonenumber-js` was **rejected**: about 80 kB for seven countries, over the budget. |
| Address | Stable keys (`landmark`, `community`, `admin_area_2`, `admin_area_1`) with labels per country (County / Region / State / Province / District). The `customers.county` column is unchanged. Datalist suggestions are provided for LR, GH, NG and RW. |
| Payments | Allowed and default methods per country, plus an owner choice (`pharmacies.payment_methods`) that `record_purchase` enforces. The table CHECK was widened to a global vocabulary of seven methods (Card and Bank Transfer are new). Liberia's till is unchanged. Insurance remains a label only: "no claim is sent". |

### 6. Regulatory and tax

- **Stored fields:** optional free-text fields in `pharmacies.regulatory`.
- **Certainty labels:**
  - **KNOWN**: business registration number, tax ID (KRA PIN in Kenya).
  - **RESEARCH_REQUIRED**: premises licence, pharmacist in charge.
- **Never** validated, required, printed or submitted.
- **Tax:** every country is RESEARCH_REQUIRED. **No rate is shipped**, and Settings says so.

### 7. Onboarding, Settings, country-switch safety

| Area | Behaviour |
|---|---|
| Onboarding | Country-first. The country `<select>` has no default, because a default gets saved as real data. After the country is chosen, the page shows currency (a choice for LR: USD/LRD), business day and payment methods. Phones are validated per country. Calls `onboard_pharmacy`, falling back to the legacy RPC on servers without 0018. |
| Settings | Owner only, in the Management group, with four tabs: General, Money (currency, payment methods, tax note), Contact (phone, address), Registration. Online-only, and it says so offline. The lock is shown and explained. A pre-sale country change requires confirmation that lists what changes and states that prices are **not** converted. Shows recent changes from the audit log. |
| Switch safety | The server lock plus immutable stamps mean no historical amount is ever re-labelled. |

### 8. Offline

- **Profile snapshot:** the IndexedDB profile snapshot now carries the resolved country
  configuration. Formatting, the till's payment methods and business dates work offline.
- **Queued sales:** each queued sale captures `p_currency` when it's made.
- **Older servers:** the client only sends `p_currency` to servers that report the Phase 9
  columns (`config.confirmed`), so a client that runs ahead of the database keeps working.

### 9. Performance

| Metric | Phase 8 | Phase 9 | Budget |
|---|---|---|---|
| Main JS (gzip) | 154.96 kB | **159.28 kB** | ~165 kB |
| CSS (gzip) | 10.54 kB | 10.54 kB | — |
| New dependencies | — | **0** | — |
| Settings screen | — | 4.69 kB, lazy | — |

The +4.3 kB covers the country module (profiles, formatting, phone, dates), the new onboarding UI
and country-aware screens.

## Gates and test results

All results are from the **local Supabase stack** with 0018 applied, using synthetic data only.
The remote backward-compatibility run is listed separately.

| Gate | What was proven | Result |
|---|---|---|
| **Gate 1**: country config + tenant schema | All 18 migrations from an **empty DB**. `50_country_model.test.sql` covers: defaults, backfill, stamping, immutability, lock, audit, owner-only settings, validation, onboarding (new and legacy), country switch before a sale, NG Card/Bank Transfer, midnight boundaries, segmentation, and anon denial. Plus RLS / tenant tests 10–40. The build passes. | **327 / 327** SQL checks (**70** new); build ✅ |
| **Gate 2**: currency and money | `country_config.test.mjs`: 8 currencies, RWF with no decimals, minor-unit rounding, per-currency totals, active tenant money, client↔server registry parity. Correctness suite (money = server). Price Compare in the pilots (Q1–Q5). Reports and Financials (GH12). | **77 / 77** unit; correctness **14 / 14**; pilots Q1–Q5 ✅ |
| **Gate 3**: timezone and localization | Kenya 00:30 local = today (21:30 UTC the day before); Kenya 23:30 local yesterday is excluded; Rwanda 01:30 local; Liberia ±1 s around midnight; device clock set to New York is ignored; the dashboard date is Nairobi's. | SQL ✅; unit ✅; pilot **W-MIDNIGHT-1…5** and KE2 ✅ |
| **Gate 4**: phone, address, payments, onboarding, Settings, mobile | E.164 storage from local input (GH8), Ghana phone hint (GH6), Region labels (GH7), per-country till (GH2, LR2), Settings lock and unverified-tax note (GH9–GH10), no pan at 360 px (GH11). | ✅ |
| **Gate 5**: multi-country pilots + full regression | Ghana, Kenya and Rwanda synthetic pilots plus Liberia unchanged; cross-country isolation (T1–T4); multi-currency (X1–X2); offline currency capture (S1–S2). | Pilots **40 / 40** |

### Full regression (local stack, Phase 9 build)

| Suite | Result |
|---|---|
| Correctness | 14 / 14 |
| Core flows A–E | 81 / 81 |
| Workflows | 15 / 15 |
| Foundation | 45 / 45 |
| Offline-first | 21 / 21 |
| Offline sale / stock | 25 / 25 |
| Staff UI | 17 / 17 |
| Recovery | 25 / 25 |
| API tenant isolation | 41 / 41 |
| API staff lifecycle | 47 / 47 |
| API realtime / offline | 25 / 25 |
| **Country pilots** | **40 / 40** |
| SQL (fresh DB) | 327 / 327 |
| Country unit tests | 77 / 77 |

### Backward compatibility: Phase 9 client against the remote backend *without* 0018

This proves the client can ship before the migration. The Liberian pilot keeps working, with
money shown as US$.

| Suite (remote Supabase, synthetic tenants) | Result |
|---|---|
| Correctness (real 30-day revenue US$422, margin 54.7%) | 14 / 14 |
| Core flows A–E | 81 / 81 |
| Workflows | 15 / 15 |
| Offline sale / stock | 25 / 25 |

### UX audit (local build, 131 page × viewport combinations, Settings included)

| | Phase 8 core | Phase 9 |
|---|---|---|
| Pages that pan horizontally | 0 | **0** |
| Real cut-off text | 0 | **0** |
| Targets under 24 px (workspace) | 0 | **0** |
| Settings screen (6 viewports): pan, clip, contrast, targets | — | **0 / 0 / 0 / 0** |
| Slow 3G + 4× CPU, login usable | 4.20 s | 4.46 s (+4.3 kB) |

The workspace contrast count fell from 186 to 42, but the local stack has sparser data than the
remote baseline, so treat that difference as indicative only.

### Test mechanics changed (assertions unchanged)

| Test | Change |
|---|---|
| `ui_phase8_correctness`, `ui_workflows` | The expected money string is now `US$…` with grouping. The assertion is still "shown = server". |
| `ui_core_flows` A1, `ui_workflows` date check | The expected "today" is now the pharmacy's date (Africa/Monrovia). It used to be the test machine's local date, which was wrong in exactly the way Phase 9 fixes. |
| `lib/harness.mjs#rectOf` | Converts layout coordinates to visual-viewport coordinates. After typing in a field on an emulated phone the visual viewport can pan (37 px here), and synthetic clicks were landing off target. A real tap is mapped by the browser, so this was a harness bug, not an app bug. |
| `ui_foundation` invite | On the local stack the invite function already creates the invitee (unconfirmed), so the test now sets that identity's password instead of failing to create it. This is a local-environment difference in untouched code. |

### Defects found and fixed during Phase 9

1. **The `purchases_method_allowed` CHECK (0011) only accepted the five Liberian methods.** Any
   Card or Bank Transfer sale (Nigeria's defaults) would have failed at insert. Caught while
   auditing. The CHECK was widened to the global vocabulary, and a regression test was added
   (Nigerian card and bank-transfer sales).
2. **A shared currency trigger read `old.status` on a table without that column.** Caught by the
   SQL suite on the first run and fixed.
3. **Supplier WhatsApp links for locally formatted numbers were broken**: `wa.me/0770…` pointed
   to a number that doesn't exist. They now get the calling code.
4. **Dead code removed:**
   - an analytics CSV builder with **fabricated figures**;
   - a non-idempotent USD purchase-order path;
   - a legacy login screen showing a fictional pharmacy.

## Deployment: done 2026-09-23

1. **Branch and tags pushed.** `phase8/ux-design-system` is pushed. The recovery tag
   `post-phase9-multicountry` was added; `pre-phase8-hardened` is untouched.
2. **Pre-checks.** Supabase CLI access was restored. 0001–0017 were confirmed on production with
   only 0018 pending. A **schema-drift fingerprint** matched a fresh 0001–0017 build, apart from
   Supabase's platform `ensure_rls` trigger. A pre-migration data dump was taken.
3. **0018 applied** with `supabase db push`. Afterwards the production schema equals the validated
   local 0001–0018 build: **647 catalogue objects identical**.
4. **Verified on production:**
   - pharmacies backfilled to LR / USD / Africa/Monrovia;
   - 7-country registry present;
   - all existing sales, orders and prices stamped USD;
   - RLS and privileges intact;
   - lock, audit and tenant-scoped settings working;
   - synthetic **Ghana, Kenya and Rwanda pilots 46/46 on the deployed production site**.
5. **Frontend deployed** to `https://nevout-meds-liberia-pilot.vercel.app` (commit `537c05b`).

Two defects found while verifying on production were fixed, redeployed and re-verified. Details
are in [FINAL_PILOT_READINESS_REPORT.md](FINAL_PILOT_READINESS_REPORT.md):
- a sign-in profile race;
- offline entries stranded in "syncing" after a crash.

Readiness is **technical** only. No country is market-entry ready except Liberia, and Liberia only
for a controlled pilot. See
[docs/country/COUNTRY_READINESS_MATRIX.md](docs/country/COUNTRY_READINESS_MATRIX.md).

## Decisions needed

1. **Liberian dual-currency tills (USD + LRD in one sale).** Not supported; one sale is one
   currency. Future requirements (explicit rate, source, timestamp, original amounts, reporting
   conversion) are in [docs/country/MIXED_CURRENCY_DESIGN_NOTE.md](docs/country/MIXED_CURRENCY_DESIGN_NOTE.md).
2. **UI translation.** The app is English-first for the pilot. Numbers and dates are
   locale-aware, but UI strings are not translated and there is no i18n infrastructure. Future
   i18n is a separate product decision.
3. **Regulatory research** before any real pharmacy outside Liberia: see the backlog and matrix.
