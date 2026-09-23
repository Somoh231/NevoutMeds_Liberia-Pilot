# Country configuration schema

Country behaviour is **data, not branches**:

- no screen contains `if (country === …)`;
- every per-country difference is a field below, read through a helper;
- the server holds the authoritative subset, and the client mirrors it for offline rendering.

## Server: `private.country_rules` (migration 0018)

Not readable by `anon` or `authenticated`. It is used only by security-definer functions and
triggers.

| Column | Type | Meaning |
|---|---|---|
| `code` | text PK | ISO 3166-1 alpha-2 (`LR`, `SL`, `GH`, `NG`, `GM`, `KE`, `RW`) |
| `name` | text | Display name. It also keeps the legacy `pharmacies.country` text in step. |
| `currencies` | text[] | Allowed operating currencies; `[1]` is the default |
| `timezones` | text[] | Allowed IANA zones; `[1]` is the default |
| `locales` | text[] | Allowed BCP-47 locales; `[1]` is the default |
| `payment_methods` | text[] | Methods a pharmacy in this country may enable |
| `default_payment_methods` | text[] | Enabled until the owner chooses (⊆ `payment_methods`) |

Helpers:

| Function | Returns |
|---|---|
| `country_code_for(text)` | Legacy free-text country → code |
| `allowed_trade_currencies(code)` | Country currencies ∪ USD |
| `pharmacy_timezone(uuid)` | The pharmacy's IANA timezone |
| `pharmacy_currency(uuid)` | The pharmacy's operating currency |
| `pharmacy_payment_methods(uuid)` | The pharmacy's enabled methods |
| `business_date(uuid)` | The pharmacy's business date |

## Server: `public.pharmacies` (new columns)

| Column | Type | Default / backfill | Written by |
|---|---|---|---|
| `country_code` | text NOT NULL | `'LR'` | `onboard_pharmacy`, `update_pharmacy_settings` |
| `default_currency` | text NOT NULL | from the country (`USD` for existing rows) | same |
| `timezone` | text NOT NULL | from the country (`Africa/Monrovia`) | same |
| `locale` | text NOT NULL | from the country (`en-LR`) | same |
| `payment_methods` | text[] NULL | NULL = the country's defaults | `update_pharmacy_settings` |
| `address_fields` | jsonb object (< 4 kB) | `{}` | keyed by stable address keys |
| `regulatory` | jsonb object (< 8 kB) | `{}` | keyed by regulatory field keys |

**Trigger `pharmacies_validate_config`** (before insert/update):

- Fills blanks from the country.
- Validates currency, timezone, locale and methods against the registry.
- On a country change, resets the values that don't belong to the new country.
- **Locks `country_code` and `default_currency` once a purchase exists** (`55000`).
- Writes every change to `public.pharmacy_config_changes`, which only the owner or admin can read.

The authenticated role cannot `UPDATE` these columns directly. Its column grant is limited to
`name, city, address, phone, whatsapp, updated_at`.

## RPCs

| RPC | Who | Purpose |
|---|---|---|
| `onboard_pharmacy(p_settings jsonb)` | signed-in user without a pharmacy | Country-first onboarding: `name`, `country_code` (required), `default_currency`, `timezone`, `locale`, `payment_methods`, contact and `address_fields`. |
| `onboard_new_pharmacy(...)` | same | Legacy signature kept. The free-text country is mapped to a code, or `LR` if unknown. |
| `update_pharmacy_settings(p_changes jsonb)` | **owner** | Allowed keys: `name, city, address, phone, whatsapp, country_code, default_currency, timezone, locale, payment_methods, address_fields, regulatory`. Unknown keys are rejected. |
| `pharmacy_country_context()` | any member | The resolved config plus `available_payment_methods`, `trade_currencies`, `business_date` and `country_locked`. |

## Client: `client/src/platform/country/`

| File | Contents |
|---|---|
| `types.ts` | `CountryCode`, `CurrencyCode`, `PaymentMethod`, `CountryProfile`, `TenantCountryConfig`, `AddressField`, `RegulatoryField`, `Certainty` |
| `profiles.ts` | The seven `CountryProfile`s (data only) and `getCountryConfig(code)` |
| `currency.ts` | `CURRENCIES`, `formatMoney`, `toMinorUnitString`, `moneyInputStep`, `totalsByCurrency`, `sameCurrency` |
| `datetime.ts` | `businessDayKey`, `businessToday`, `startOfBusinessDay`, `addDays`, `daysBetween`, `formatDate`, `formatDateTime`, `formatNumber` |
| `phone.ts` | `parsePhone`, `formatPhone`, `whatsappDigits`, `phoneHint` |
| `fields.ts` | `getAddressFields`, `addressLabel`, `getPaymentMethods`, `getAvailablePaymentMethods`, `getTradeCurrencies`, `getRegulatoryFields`, `getTaxPolicy`, `paymentMethodHint` |
| `tenant.ts` | The active tenant config: `resolveTenantConfig`, `money`, `moneyIn`, `moneyTotals`, `tenantToday`, `tenantDate`, `tenantDateTime` |
| `CountryProvider.tsx` | `CountryProvider`, `useCountry()` |
| `index.ts` | Barrel |

### `CountryProfile`

```ts
{
  code, name, flag,
  currencies: CurrencyCode[],            // [0] default operating currency
  timezones: string[],                   // [0] default
  locales: string[],                     // [0] default
  paymentMethods: PaymentMethod[],       // display order at the till
  defaultPaymentMethods: PaymentMethod[],
  phone: { callingCode, nsnLengths, trunkPrefix, groups, example },
  address: AddressField[],               // stable keys + country labels
  regulatory: RegulatoryField[],         // KNOWN | RESEARCH_REQUIRED
  tax: { certainty: "RESEARCH_REQUIRED", note }
}
```

### Stable address keys

| Key | Customers column | LR | SL | GH | NG | GM | KE | RW |
|---|---|---|---|---|---|---|---|---|
| `landmark` | `landmark` | Nearest landmark | Nearest landmark | Nearest landmark | Nearest landmark | Nearest landmark | Nearest landmark | Nearest landmark |
| `community` | `community` | Community | Community / area | Area / suburb | Area / neighbourhood | Community / area | Estate / area | Sector / cell |
| `admin_area_2` | (pharmacy only) | — | — | District | LGA | — | Sub-county | District |
| `admin_area_1` | `county` | County (15 suggestions) | District | Region (16) | State (37) | Region | County | Province (5) |

Suggestions are a `<datalist>`, so free text is always accepted. Existing Liberian `county`
values keep working unchanged.

## Parity

`supabase/tests/country_config.test.mjs` parses `0018_country_tenant_model.sql` and fails if a
client profile's currencies, timezones, locales, payment methods or defaults differ from
`private.country_rules`.

## Adding a country

1. Add a row to `private.country_rules` in a new migration.
2. Add a `CountryProfile` in `profiles.ts` and the code to `CountryCode`.
3. If the currency is new, add it to `CURRENCIES` and `CurrencyCode`.
4. Run the country tests. The parity check catches mismatches.
5. Add the country to [COUNTRY_READINESS_MATRIX.md](COUNTRY_READINESS_MATRIX.md) and to the
   research backlog.
