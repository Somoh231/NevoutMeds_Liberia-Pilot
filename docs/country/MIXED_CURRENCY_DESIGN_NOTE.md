# Mixed-currency sales: current behaviour and future design note

**Status: not built, deliberately.** This note records the current behaviour and what a future
design must include. Nothing here is implemented, and no live FX exists.

## Current behaviour (Phase 9)

1. **A sale is recorded in exactly one currency:** the pharmacy's operating currency
   (`pharmacies.default_currency`). The server stamps it on `purchases.currency_code` and it can
   never be changed.
2. **A single transaction mixing USD and LRD is not supported.** A Liberian pharmacy picks USD
   or LRD as its operating currency; the pilots use USD. A customer who pays part in L$ has to be
   handled outside the system, as a till adjustment, until this design is built.
3. **Supplier prices and purchase orders** may be in the country's currencies or USD, and each
   carries its own currency. They are never ranked, summed or compared across currencies.
4. **Reports never add amounts in different currencies.** Other-currency totals are shown beside
   the operating-currency totals (`financial_summary.other_currencies`).
5. **Historical transactions are never converted.** The immutability trigger enforces this.

This is acceptable for the controlled Liberia pilot. Each pharmacy prices and sells in one
currency, and nothing in the product can silently mix currencies.

## What a future mixed-currency design must include

| Element | Requirement |
|---|---|
| **Explicit FX rate** | A rate stored as `numeric` (never float), per currency pair (e.g. USD→LRD), per pharmacy. Entered by the owner or taken from a named source. Never implied. |
| **FX source** | Where the rate came from, one of: `owner_entered`, `central_bank_published` or `provider:<name>`. Plus who recorded it. Rates entered at the till are attributable to a staff member. |
| **Rate timestamp** | The time the rate is effective from (`effective_at`), and the time it was recorded. A sale references the exact rate row it used; rates are never updated in place. |
| **Original amounts** | Each tender line keeps its **original currency and amount** (e.g. US$10.00 + L$950.00). Any converted value is derived and stored next to it, never instead of it. |
| **Reporting conversion** | Reports are in the operating currency by default, with converted figures labelled "converted at recorded rates". Unconverted originals must always be available. Reports must never re-convert history with today's rate. |
| **Rounding rules** | Per-currency minor units (ISO 4217). Change is given in one declared currency. |
| **Offline** | A queued sale carries the rate id and the rate itself. The server rejects it if that rate row doesn't exist, and never substitutes a newer one. |
| **Audit** | Rate changes are logged the way `pharmacy_config_changes` logs settings changes. |

## Non-goals, even then

- No automatic conversion of historical transactions.
- No live FX feed without an owner decision about the source and its failure behaviour.
- No trading, hedging or remittance functionality.

## Decision needed before building

- Who sets the rate (owner vs. a published source)?
- How often is it set (daily vs. per shift)?
- Which currency are daily totals and credit balances kept in?

These are product and accounting decisions to make with the pilot pharmacies, not engineering
defaults.
