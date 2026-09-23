# Currency model

## Rules

1. **Every money record carries its currency.**
   - Sales use `purchases.currency_code`.
   - Supplier prices use `supplier_catalogue.currency`.
   - Purchase orders use `purchase_orders.currency`.

   Sale lines (`purchase_items`), customer balances, product prices and stock values are in the
   pharmacy's **operating currency** (`pharmacies.default_currency`). They can't drift from it,
   because the operating currency is locked after the first sale.
2. **Amounts are never converted.** NevOut Meds has no exchange-rate table and no live FX. Amounts in different currencies are
   shown side by side ("US$120.00 + L$4,000.00") and never added, compared or ranked against each
   other.
3. **Historical amounts keep the currency they were recorded in.**
   - The pre-Phase-9 backfill labels existing sales **USD**. That is what the app always displayed
     ("$") and how the Liberian pilots priced.
   - `purchases.currency_code` can't be updated. A trigger rejects the change, even for the
     database owner.
   - A placed order's currency can't change either.
4. **The operating currency locks after the first sale.**
   - `update_pharmacy_settings` goes through the pharmacies trigger, which refuses to change
     `country_code` or `default_currency` once a purchase exists (SQLSTATE `55000`).
   - Support can correct a mis-onboarded pharmacy only from a direct database session with
     `nevout.country_change_override=on`, which is never possible through the API.
5. **No floating point in authoritative money.**
   - Postgres stores money as `numeric`, and the server computes sale and order totals.
   - The client only formats amounts. User input is rounded to the currency's minor unit as a
     string (`toMinorUnitString`) before it's sent.

## Supported currencies

| Code | Name | Symbol shown | Minor digits | Countries |
|---|---|---|---|---|
| USD | US dollar | **US$** | 2 | Liberia (default), and a trade currency everywhere |
| LRD | Liberian dollar | L$ | 2 | Liberia |
| SLE | Sierra Leonean leone | Le | 2 | Sierra Leone |
| GHS | Ghanaian cedi | GH₵ | 2 | Ghana |
| NGN | Nigerian naira | ₦ | 2 | Nigeria |
| GMD | Gambian dalasi | D | 2 | The Gambia |
| KES | Kenyan shilling | KSh | 2 | Kenya |
| RWF | Rwandan franc | FRw | **0** | Rwanda |

- **Ambiguity-safe symbols.** A bare `$` never appears. An unknown code is shown as the code
  ("12.00 XOF"), never with a guessed symbol.
- **Grouping and decimals** come from the pharmacy's locale via `Intl.NumberFormat`. For example,
  `fr-RW` groups with a narrow space.

**Trade currencies.** A supplier price or purchase order may be recorded in the country's own
currencies plus USD, because regional wholesalers often quote in dollars. The server
(`private.allowed_trade_currencies`) and the client (`getTradeCurrencies`) agree, and the country
config test checks parity.

**Liberia's two currencies.**
- Liberia allows USD and LRD as the operating currency. The pilots stay USD.
- A pharmacy that sells in L$ picks LRD at onboarding.
- Dual-currency tills are not supported: one sale can't mix USD and LRD, because that needs a
  recorded exchange rate. That feature needs a decision first; see the architecture report.

## Where it is enforced

| Layer | Mechanism |
|---|---|
| Table | `purchases_currency_code_format` (ISO-3 shape); the stamping triggers `purchases_stamp_currency`, `supplier_catalogue_stamp_currency` and `purchase_orders_stamp_currency` |
| RPC | `record_purchase_idempotent(…, p_currency)`: a sale priced in another currency is a **409 conflict**, never re-labelled. `create_purchase_order`: the currency defaults to the pharmacy's and is validated. |
| Reports | `financial_summary` sums **only** the operating currency. Other currencies are returned separately in `other_currencies` and shown by `OtherCurrencies` in Financials and Reports. `staff_performance`, the dashboard and product sales filter to the operating currency. |
| Client | `money()` / `moneyIn()` / `moneyTotals()` in `platform/country/tenant.ts`; Price Compare groups by currency |
| Offline | A queued sale carries `p_currency`, captured when it was made (only sent to Phase 9 servers). |

## Tests

- `supabase/tests/50_country_model.test.sql`: stamping, immutability, the lock, the 409 on a
  mismatch, per-currency segmentation, trade currencies and Nigerian card sales.
- `supabase/tests/country_config.test.mjs`: formatting for all 8 currencies, RWF with no decimals,
  totals per currency, and client↔server registry parity.
- `supabase/tests/ui_country_pilots.e2e.mjs`:
  - GH₵ and FRw in the UI, and the server stamps GHS and RWF.
  - Mixed-currency Price Compare.
  - An order placed in the quote's currency.
  - An offline sale that keeps its currency.
  - No bare `$` anywhere.
