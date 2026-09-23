# Countries, currencies and localization

NevOut Meds started as a Liberian pilot. Phase 9 made "Liberia" a **configuration** instead of
an assumption. Liberia is still the default, and it still behaves exactly as before: USD, the
Africa/Monrovia business day (UTC+0), and the same five payment methods in the same order. The
visible change is that money now reads **US$** instead of a bare `$`.

## Supported countries

| Country | Currency | Business day | Status |
|---|---|---|---|
| 🇱🇷 Liberia | US$ (or L$) | Africa/Monrovia | **Live pilot** |
| 🇸🇱 Sierra Leone | Le | Africa/Freetown | Configured and seeded; synthetic tests only |
| 🇬🇭 Ghana | GH₵ | Africa/Accra | Configured; **synthetic pilot passed** |
| 🇳🇬 Nigeria | ₦ | Africa/Lagos | Configured and seeded; SQL-tested |
| 🇬🇲 The Gambia | D | Africa/Banjul | Configured and seeded; synthetic tests only |
| 🇰🇪 Kenya | KSh | Africa/Nairobi | Configured; **synthetic pilot passed** (midnight) |
| 🇷🇼 Rwanda | FRw (no decimals) | Africa/Kigali | Configured; **synthetic pilot passed** |

"Configured" means **technical architecture ready**. It does **not** mean regulatory or
market-entry ready; only Liberia is cleared, and only for a controlled pilot. See
[COUNTRY_READINESS_MATRIX.md](COUNTRY_READINESS_MATRIX.md).

## Language and localization status

- **English-first for the current pilot.** All UI strings are English.
- **Localized today:** number grouping and decimals, currency symbols and minor units, date
  formats (day-month-year, four-digit years), timezone-correct business dates, phone formats and
  address labels, all from the pharmacy's `locale` and country profile.
- **Not localized:** UI text. There are no translated strings and no message catalogue or i18n
  library. French/Kinyarwanda (Rwanda) and Swahili (Kenya) are **not** supported.
- **Future i18n** (translation workflow, string extraction, right-sized library, bundle budget) is
  a separate product decision and is not part of the pilot.

## Documents

| Document | What it covers |
|---|---|
| [COUNTRY_ASSUMPTIONS_AUDIT.md](COUNTRY_ASSUMPTIONS_AUDIT.md) | Every Liberia assumption that was found, how it was classified, and what happened to it |
| [COUNTRY_CONFIG_SCHEMA.md](COUNTRY_CONFIG_SCHEMA.md) | The server registry, pharmacy columns, RPCs, client module, address keys, and how to add a country |
| [CURRENCY_MODEL.md](CURRENCY_MODEL.md) | Stamping, no conversion, locks, symbols, trade currencies |
| [TIMEZONE_MODEL.md](TIMEZONE_MODEL.md) | Business days, server authority, the midnight tests, deliberate exceptions |
| [COUNTRY_READINESS_MATRIX.md](COUNTRY_READINESS_MATRIX.md) | What is ready, tested or unknown per country |
| [REGULATORY_RESEARCH_BACKLOG.md](REGULATORY_RESEARCH_BACKLOG.md) | Everything regulatory that was deliberately *not* built |
| [MIXED_CURRENCY_DESIGN_NOTE.md](MIXED_CURRENCY_DESIGN_NOTE.md) | Current one-currency-per-sale behaviour and the future FX design requirements |
| [../../MULTI_COUNTRY_ARCHITECTURE_REPORT.md](../../MULTI_COUNTRY_ARCHITECTURE_REPORT.md) | The Phase 9 report: decisions, gates, test results, deployment steps |

## For developers

**Formatting**

- Money in the pharmacy's currency: `fmt(n)` or `money(n)`.
- A record that carries its own currency (supplier prices, orders): `moneyIn(n, currency)`.
- Rows that may mix currencies: `moneyTotals(rows, currencyOf, amountOf)`.
- Never write `$` or `toFixed(2)` for display.

**Dates**

- "Today": `tenantToday()`.
- Display: `tenantDate(value)` / `tenantDateTime(value)`.
- Never write `new Date().toISOString().slice(0, 10)` for a business date.

**Per-country fields**

- Address: `getAddressFields(country)`.
- Payment methods: `getPaymentMethods(config)`.
- Phone: `parsePhone(input, country)` / `formatPhone(stored, country)`.
- Registration details: `getRegulatoryFields(country)`.
- Screens never branch on the country code.

**Tests**

| Test | How to run |
|---|---|
| Country helpers + registry parity | `node supabase/tests/country_config.test.mjs` |
| Database (fresh DB, all migrations) | `supabase/tests/run_local_validation.sh` |
| Synthetic pilots (local stack) | `supabase/tests/ui_country_pilots.e2e.mjs` |
| Demo data for all seven countries (local stack) | `node supabase/tests/seed_country_profiles.mjs` |
