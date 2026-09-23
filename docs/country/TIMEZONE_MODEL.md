# Timezone and business-date model

## The rule

A pharmacy's **business day** is the calendar day in **its own timezone**
(`pharmacies.timezone`, an IANA name). It is not the device's day and not UTC.

- "Today's sales", the daily report and the Reports and Financials periods all follow it.
- So do the reminders due today, the expiry countdowns and a customer's last visit.

| Country | Timezone | UTC offset | DST |
|---|---|---|---|
| Liberia | Africa/Monrovia | +0 | no |
| Sierra Leone | Africa/Freetown | +0 | no |
| Ghana | Africa/Accra | +0 | no |
| The Gambia | Africa/Banjul | +0 | no |
| Nigeria | Africa/Lagos | +1 | no |
| Rwanda | Africa/Kigali | +2 | no |
| Kenya | Africa/Nairobi | +3 | no |

**Liberia is unchanged.** Africa/Monrovia is UTC+0, so every Liberian business date is exactly
the UTC date it was before Phase 9.

## The server decides, from the pharmacy row

The client never supplies a timezone to the server:

- `private.pharmacy_timezone(pharmacy)` reads `pharmacies.timezone`.
- `private.business_date(pharmacy)` = `(now() at time zone tz)::date`.
- `financial_summary` and `staff_performance` compute:
  - today = `(now() at time zone tz)::date`
  - window start = `(today - (days-1))::timestamp at time zone tz`, which is local midnight
    expressed as an instant
  - buckets = `(purchased_at at time zone tz)::date`

  `financial_summary` also returns `timezone` and `business_date`, so the UI and tests can see
  what the server used.
- `record_purchase` sets `last_visit` to the business date. New customers are registered on the
  business date (trigger).
- The timezone is validated against the country (`private.country_rules.timezones`) and can only
  be changed by the owner through `update_pharmacy_settings`.

## The client mirrors it for display

The helpers live in `client/src/platform/country/datetime.ts` and `tenant.ts`:

- `tenantToday()` → "YYYY-MM-DD" in the pharmacy's zone.
- `businessDayKey(instant, tz)` buckets a timestamp.
- `startOfBusinessDay(dayKey, tz)` gives the instant local midnight begins, from `Intl` offsets.
  No timezone library is needed.
- `formatDate()`:
  - **date-only values** (expiry, due dates, business days) are formatted as calendar dates in
    UTC, so no zone can shift them;
  - **timestamps** are shown in the pharmacy's zone.
- The dashboard greeting and date use the pharmacy's zone.

The emulated-device test proves the device clock is ignored: a Kenyan pharmacy viewed from a
device set to America/New_York still shows the Nairobi date and Nairobi's "today".

## Deliberate exceptions

| What | Why |
|---|---|
| Admin console RPCs (`admin_*`, 0008–0010) | These are cross-tenant platform views that compare pharmacies across countries, so no single business day applies. They stay in UTC and are labelled as such. |
| `documents.uploaded_at` default | Display-only. It can be one day off for UTC+2/+3 pharmacies between local midnight and 02:00/03:00. Low impact; logged for a later migration. |
| Stored timestamps | Always `timestamptz` (instants). Only *business dates* depend on the zone. |

## Tests (the mandatory UTC-midnight cases)

- **SQL** (`50_country_model.test.sql`):
  - Kenya: 00:30 local today (21:30 UTC the day before) counts as today; 23:30 local yesterday
    lands on the previous day.
  - Rwanda: 01:30 local (23:30 UTC) counts as today.
  - Liberia: one second either side of midnight.
  - Kenyan customers register on the Nairobi date.
- **Unit** (`country_config.test.mjs`): day keys at 21:30Z, 23:30Z, 23:59:59Z and 00:00:00Z, and
  business-day starts for Nairobi, Kigali, Lagos and Monrovia.
- **E2E** (`ui_country_pilots.e2e.mjs`): the same Kenya and Liberia boundaries through the real
  Sales screen, with the device timezone emulated as New York.
