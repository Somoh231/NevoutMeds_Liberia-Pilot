-- NevOut Meds — Tanzania country support.
--
-- Data only: one row in the server country registry (private.country_rules,
-- created in 0018). No table, column, constraint, function, policy or grant
-- changes. Existing countries are untouched.
--
-- Only the facts needed to run the app: currency TZS, timezone
-- Africa/Dar_es_Salaam (UTC+3, no daylight saving), locales en-TZ (default)
-- and sw-TZ, and the framework's standard manual payment-method records (the
-- same set and defaults as Kenya and Rwanda; "Mobile Money" is a label the
-- pharmacy records, not a provider integration).
--
-- Deliberately absent, as for every country: tax/VAT, licensing, prescription,
-- insurance and medicine-registration rules. Adding Tanzania does not make it
-- regulatory-ready (docs/country/REGULATORY_RESEARCH_BACKLOG.md).

insert into private.country_rules (code, name, currencies, timezones, locales, payment_methods, default_payment_methods) values
  ('TZ', 'Tanzania',     array['TZS'], array['Africa/Dar_es_Salaam'], array['en-TZ', 'sw-TZ'],
     array['Cash','Mobile Money','Credit','Insurance','Card','Bank Transfer'],
     array['Cash','Mobile Money','Credit'])
on conflict (code) do update set
  name = excluded.name, currencies = excluded.currencies, timezones = excluded.timezones,
  locales = excluded.locales, payment_methods = excluded.payment_methods,
  default_payment_methods = excluded.default_payment_methods;
