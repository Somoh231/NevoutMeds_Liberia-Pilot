-- NevOut Meds — Phase 9: country, currency and timezone model.
-- Reuses the tests.* scaffolding and fixtures from 10_rls_tenant_security
-- (pharmacies A/B are Liberian pilots created with only a name).

set client_min_messages = notice;

create or replace function tests.is_text(p_desc text, p_sql text, p_expected text) returns void language plpgsql as $$
declare v text; t0 timestamptz := clock_timestamp();
begin
  execute p_sql into v;
  perform tests.report(v is not distinct from p_expected, p_desc || ' [got ' || coalesce(v, 'null') || ', want ' || coalesce(p_expected, 'null') || ']', extract(epoch from clock_timestamp()-t0)*1000);
exception when others then
  perform tests.report(false, p_desc || ' [' || sqlerrm || ']', extract(epoch from clock_timestamp()-t0)*1000);
end $$;

-- Statement must fail with a specific SQLSTATE.
create or replace function tests.throws_code(p_desc text, p_sql text, p_code text) returns void language plpgsql as $$
declare t0 timestamptz := clock_timestamp();
begin
  execute p_sql;
  perform tests.report(false, p_desc || ' [statement succeeded]', extract(epoch from clock_timestamp()-t0)*1000);
exception when others then
  perform tests.report(sqlstate = p_code, p_desc || ' [' || sqlstate || ': ' || sqlerrm || ']', extract(epoch from clock_timestamp()-t0)*1000);
end $$;

insert into tests.ids (key, id) values
  ('ownerGH', gen_random_uuid()), ('ownerKE', gen_random_uuid()), ('ownerRW', gen_random_uuid()),
  ('ownerLegacy', gen_random_uuid()), ('phKE', gen_random_uuid()), ('phRW', gen_random_uuid()),
  ('custKE', gen_random_uuid()), ('custRW', gen_random_uuid()), ('custLR', gen_random_uuid())
on conflict (key) do nothing;

insert into auth.users (id, email, aud, role)
select id, key || '@test.local', 'authenticated', 'authenticated'
from tests.ids where key in ('ownerGH','ownerKE','ownerRW','ownerLegacy')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Liberia keeps working exactly (defaults for a pharmacy created by name)
-- ---------------------------------------------------------------------------
select tests.is_text('existing pharmacy defaults to Liberia',
  format('select country_code from public.pharmacies where id = %L', tests.id('phA')), 'LR');
select tests.is_text('existing pharmacy keeps USD (what "$" always meant)',
  format('select default_currency from public.pharmacies where id = %L', tests.id('phA')), 'USD');
select tests.is_text('existing pharmacy runs on Africa/Monrovia',
  format('select timezone from public.pharmacies where id = %L', tests.id('phA')), 'Africa/Monrovia');
select tests.is_text('legacy country column stays in step',
  format('select country from public.pharmacies where id = %L', tests.id('phA')), 'Liberia');
select tests.is_text('Liberia keeps all five original payment methods',
  format($q$select array_to_string(private.pharmacy_payment_methods(%L), ',')$q$, tests.id('phA')),
  'Cash,Mobile Money,Credit,Diaspora Pay,Insurance');
select tests.is('every purchase recorded before Phase 9 carries a currency',
  'select count(*) from public.purchases where currency_code is null', 0);

-- ---------------------------------------------------------------------------
-- 2. Sales are stamped with the pharmacy currency and never re-labelled
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.lives('Liberian sale is recorded as before',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Diaspora Pay', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',1,'unit_price',1.00)),
      'country-key-lr-0001')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
select tests.lives('a sale priced in USD is accepted by a USD pharmacy',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',1,'unit_price',1.00)),
      'country-key-lr-0002', 'USD')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
select tests.throws_code('a sale queued in another currency is a conflict, not re-labelled',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',1,'unit_price',1.00)),
      'country-key-lr-0003', 'LRD')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')), 'PT409');
reset role;
select tests.is('the conflicting sale wrote nothing (not even a receipt)',
  $q$select count(*) from public.mutation_receipts where idempotency_key = 'country-key-lr-0003'$q$, 0);
select tests.is_text('the recorded sale is stamped USD',
  $q$select p.currency_code from public.purchases p
     join public.mutation_receipts r on (r.result->>'purchase_id')::uuid = p.id
     where r.idempotency_key = 'country-key-lr-0001'$q$, 'USD');
select tests.throws_code('a recorded sale''s currency cannot be changed, even by the database owner',
  format($q$update public.purchases set currency_code = 'LRD' where pharmacy_id = %L$q$, tests.id('phA')), '55000');

-- ---------------------------------------------------------------------------
-- 3. Settings: owner-only, validated, audited, locked after sales
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot change pharmacy settings',
  $q$select public.update_pharmacy_settings('{"city":"Buchanan"}')$q$);
select tests.throws('staff cannot write the new configuration columns directly',
  format($q$update public.pharmacies set timezone = 'Africa/Accra' where id = %L$q$, tests.id('phA')));

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner can change contact details',
  $q$select public.update_pharmacy_settings('{"city":"Buchanan","phone":"+231 77 000 0000"}')$q$);
select tests.throws_code('country is locked once the pharmacy has sales',
  $q$select public.update_pharmacy_settings('{"country_code":"GH"}')$q$, '55000');
select tests.throws_code('currency is locked once the pharmacy has sales',
  $q$select public.update_pharmacy_settings('{"default_currency":"LRD"}')$q$, '55000');
select tests.throws_code('owner cannot set the country column directly',
  format($q$update public.pharmacies set country_code = 'GH' where id = %L$q$, tests.id('phA')), '42501');
select tests.throws('unknown settings keys are rejected',
  $q$select public.update_pharmacy_settings('{"id":"00000000-0000-0000-0000-000000000000"}')$q$);
select tests.throws('a timezone outside the country is rejected',
  $q$select public.update_pharmacy_settings('{"timezone":"Africa/Lagos"}')$q$);
select tests.throws('a payment method the country does not offer is rejected',
  $q$select public.update_pharmacy_settings('{"payment_methods":["Cash","Barter"]}')$q$);
select tests.throws('disabling every payment method is rejected',
  $q$select public.update_pharmacy_settings('{"payment_methods":[]}')$q$);
select tests.lives('owner can narrow payment methods to Cash only',
  $q$select public.update_pharmacy_settings('{"payment_methods":["Cash"]}')$q$);

select tests.login('staffA');
set role authenticated;
select tests.throws('a disabled payment method is rejected at sale time',
  format($q$select public.record_purchase(%L, %L, 'Mobile Money', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',1,'unit_price',1.00)))$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
select tests.is('staff cannot read the configuration audit log', 'select count(*) from public.pharmacy_config_changes', 0);

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner restores the country default methods',
  $q$select public.update_pharmacy_settings('{"payment_methods":null}')$q$);
select tests.is('owner sees the audit trail of their changes (payment methods twice)',
  $q$select count(*) from public.pharmacy_config_changes where field = 'payment_methods'$q$, 2);
select tests.is_text('country context reports the lock and business date',
  $q$select (public.pharmacy_country_context()->>'country_locked') || ' ' || (public.pharmacy_country_context()->>'default_currency')$q$,
  'true USD');
select tests.throws('the country registry is not readable directly',
  'select count(*) from private.country_rules');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Country-first onboarding
-- ---------------------------------------------------------------------------
select tests.login('ownerGH');
set role authenticated;
select tests.throws('unsupported country is rejected',
  $q$select public.onboard_pharmacy('{"name":"X","country_code":"XX"}')$q$);
select tests.throws('a currency from another country is rejected',
  $q$select public.onboard_pharmacy('{"name":"X","country_code":"GH","default_currency":"NGN"}')$q$);
select tests.throws('onboarding without a country is rejected',
  $q$select public.onboard_pharmacy('{"name":"X"}')$q$);
select tests.lives('a Ghanaian pharmacy onboards with country defaults',
  $q$select public.onboard_pharmacy('{"name":"Accra Test Pharmacy","country_code":"GH","city":"Accra","owner_name":"Owner GH"}')$q$);
reset role;
insert into tests.ids (key, id)
select 'phGH', pharmacy_id from public.users_profiles where id = tests.id('ownerGH')
on conflict (key) do update set id = excluded.id;
select tests.is_text('Ghana defaults: GHS, Africa/Accra, en-GH',
  format($q$select default_currency || ' ' || timezone || ' ' || locale from public.pharmacies where id = %L$q$, tests.id('phGH')),
  'GHS Africa/Accra en-GH');
select tests.is_text('Ghana payment defaults exclude Liberia-only methods',
  format($q$select array_to_string(private.pharmacy_payment_methods(%L), ',')$q$, tests.id('phGH')),
  'Cash,Mobile Money,Credit');

select tests.login('ownerLegacy');
set role authenticated;
select tests.lives('the legacy onboarding RPC still works',
  $q$select public.onboard_new_pharmacy('Legacy Pharmacy', 'Ghana', 'Kumasi')$q$);
reset role;
select tests.is_text('the legacy free-text country maps to a code',
  format($q$select ph.country_code || ' ' || ph.default_currency from public.pharmacies ph
            join public.users_profiles up on up.pharmacy_id = ph.id where up.id = %L$q$, tests.id('ownerLegacy')),
  'GH GHS');

-- Before any sale, a mis-onboarded pharmacy can still move country; the
-- currency, timezone and payment methods follow the new country.
select tests.login('ownerLegacy');
set role authenticated;
select tests.lives('country can change before the first sale',
  $q$select public.update_pharmacy_settings('{"country_code":"KE"}')$q$);
reset role;
select tests.is_text('switching country resets currency, timezone and locale to the new country',
  format($q$select ph.default_currency || ' ' || ph.timezone || ' ' || ph.locale from public.pharmacies ph
            join public.users_profiles up on up.pharmacy_id = ph.id where up.id = %L$q$, tests.id('ownerLegacy')),
  'KES Africa/Nairobi en-KE');

-- ---------------------------------------------------------------------------
-- 5. Ghana: currency and payment rules, supplier prices, orders
-- ---------------------------------------------------------------------------
insert into public.customers (pharmacy_id, phone, first_name, last_name)
values (tests.id('phGH'), '+233200000001', 'Ama', 'Mensah');
insert into public.products (pharmacy_id, name, category, unit_cost, selling_price)
values (tests.id('phGH'), 'Paracetamol GH', 'Analgesic', 2, 5);
insert into public.inventory (pharmacy_id, product_id, stock)
select tests.id('phGH'), id, 40 from public.products where pharmacy_id = tests.id('phGH');
insert into public.suppliers (pharmacy_id, name) values (tests.id('phGH'), 'Accra Wholesale');

select tests.login('ownerGH');
set role authenticated;
select tests.throws('a Liberia-only method (Diaspora Pay) is rejected in Ghana',
  format($q$select public.record_purchase(%L, (select id from public.customers limit 1), 'Diaspora Pay', null,
      jsonb_build_array(jsonb_build_object('product_id', (select id from public.products limit 1)::text, 'name','Paracetamol GH','qty',1,'unit_price',5)))$q$,
    tests.id('phGH')));
select tests.throws_code('a USD-priced offline sale is refused by a GHS pharmacy',
  format($q$select public.record_purchase_idempotent(%L, (select id from public.customers limit 1), 'Cash', null,
      jsonb_build_array(jsonb_build_object('product_id', (select id from public.products limit 1)::text, 'name','Paracetamol GH','qty',1,'unit_price',5)),
      'country-key-gh-0001', 'USD')$q$, tests.id('phGH')), 'PT409');
select tests.lives('a GHS sale by Mobile Money is recorded',
  format($q$select public.record_purchase_idempotent(%L, (select id from public.customers limit 1), 'Mobile Money', null,
      jsonb_build_array(jsonb_build_object('product_id', (select id from public.products limit 1)::text, 'name','Paracetamol GH','qty',2,'unit_price',5)),
      'country-key-gh-0002', 'GHS')$q$, tests.id('phGH')));
select tests.is_text('the Ghana sale is stamped GHS', 'select currency_code from public.purchases', 'GHS');
select tests.is_text('Ghana financial summary reports GHS and Africa/Accra',
  $q$select (public.financial_summary(30)->>'currency') || ' ' || (public.financial_summary(30)->>'timezone') || ' ' || (public.financial_summary(30)->'revenue'->>'total')$q$,
  'GHS Africa/Accra 10');
select tests.is('Ghana owner cannot see Liberian purchases', 'select count(*) from public.purchases where currency_code = ''USD''', 0);
select tests.is('Ghana owner cannot see the Liberian audit log',
  format('select count(*) from public.pharmacy_config_changes where pharmacy_id = %L', tests.id('phA')), 0);
select tests.is('Ghana owner cannot read the Liberian pharmacy row',
  format('select count(*) from public.pharmacies where id = %L', tests.id('phA')), 0);
select tests.lives('a purchase order without a currency defaults to GHS',
  format($q$select public.create_purchase_order_idempotent(%L, (select id from public.suppliers limit 1),
      jsonb_build_array(jsonb_build_object('product_id', (select id from public.products limit 1)::text, 'name','Paracetamol GH','qty',100,'unit_price',2)),
      'country-key-gh-po-0001')$q$, tests.id('phGH')));
select tests.is_text('the order is stamped GHS', 'select currency from public.purchase_orders', 'GHS');
select tests.throws_code('a placed order cannot be re-labelled in another currency',
  $q$update public.purchase_orders set currency = 'USD'$q$, '55000');
select tests.lives('a Ghanaian supplier price may be recorded in USD',
  format($q$insert into public.supplier_catalogue (pharmacy_id, supplier_id, product_name, unit_cost, currency)
            values (%L, (select id from public.suppliers limit 1), 'Paracetamol GH', 0.15, 'USD')$q$, tests.id('phGH')));
select tests.throws_code('a Ghanaian supplier price cannot be recorded in Liberian dollars',
  format($q$insert into public.supplier_catalogue (pharmacy_id, supplier_id, product_name, unit_cost, currency)
            values (%L, (select id from public.suppliers limit 1), 'Paracetamol GH', 30, 'LRD')$q$, tests.id('phGH')), '22023');
reset role;
select tests.is_text('a supplier price without a currency defaults to the pharmacy currency',
  format($q$with ins as (insert into public.supplier_catalogue (pharmacy_id, supplier_id, product_name, unit_cost)
            values (%L, (select id from public.suppliers where pharmacy_id = %L limit 1), 'ORS GH', 1.2) returning currency)
            select currency from ins$q$, tests.id('phGH'), tests.id('phGH')),
  'GHS');

-- ---------------------------------------------------------------------------
-- 6. Business days follow the pharmacy timezone (midnight boundaries)
-- ---------------------------------------------------------------------------
insert into public.pharmacies (id, name, country_code) values
  (tests.id('phKE'), 'Nairobi Test Pharmacy', 'KE'),
  (tests.id('phRW'), 'Kigali Test Pharmacy', 'RW');
insert into public.users_profiles (id, pharmacy_id, role, name) values
  (tests.id('ownerKE'), tests.id('phKE'), 'owner', 'Owner KE'),
  (tests.id('ownerRW'), tests.id('phRW'), 'owner', 'Owner RW');
insert into public.customers (id, pharmacy_id, phone, first_name, last_name) values
  (tests.id('custKE'), tests.id('phKE'), '+254700000001', 'Wanjiru', 'K'),
  (tests.id('custRW'), tests.id('phRW'), '+250780000001', 'Uwase', 'R'),
  (tests.id('custLR'), tests.id('phA'),  '+231770000009', 'Midnight', 'LR');

select tests.is_text('Kenyan customers register on the Nairobi date',
  format('select registered_at::text from public.customers where id = %L', tests.id('custKE')),
  ((now() at time zone 'Africa/Nairobi')::date)::text);

-- Kenya (UTC+3): 00:30 local today is 21:30 UTC on the previous UTC date.
-- Local 23:30 yesterday must not count as today.
insert into public.purchases (pharmacy_id, customer_id, purchased_at, items_text, amount, method) values
  (tests.id('phKE'), tests.id('custKE'),
   ((now() at time zone 'Africa/Nairobi')::date::timestamp + interval '30 minutes') at time zone 'Africa/Nairobi', 'x', 7, 'Cash'),
  (tests.id('phKE'), tests.id('custKE'),
   ((now() at time zone 'Africa/Nairobi')::date::timestamp - interval '30 minutes') at time zone 'Africa/Nairobi', 'x', 100, 'Cash');
-- Rwanda (UTC+2): 01:30 local today is 23:30 UTC yesterday.
insert into public.purchases (pharmacy_id, customer_id, purchased_at, items_text, amount, method) values
  (tests.id('phRW'), tests.id('custRW'),
   ((now() at time zone 'Africa/Kigali')::date::timestamp + interval '90 minutes') at time zone 'Africa/Kigali', 'x', 1500, 'Cash');
-- Liberia (UTC+0): one second either side of midnight.
insert into public.purchases (pharmacy_id, customer_id, purchased_at, items_text, amount, method) values
  (tests.id('phA'), tests.id('custLR'),
   ((now() at time zone 'Africa/Monrovia')::date::timestamp - interval '1 second') at time zone 'Africa/Monrovia', 'x', 1000, 'Cash'),
  (tests.id('phA'), tests.id('custLR'),
   ((now() at time zone 'Africa/Monrovia')::date::timestamp + interval '1 second') at time zone 'Africa/Monrovia', 'x', 0.25, 'Cash');

select tests.is_text('Kenyan sales are stamped KES, Rwandan RWF',
  format($q$select string_agg(distinct currency_code, ',' order by currency_code) from public.purchases where pharmacy_id in (%L, %L)$q$,
    tests.id('phKE'), tests.id('phRW')), 'KES,RWF');

select tests.login('ownerKE');
set role authenticated;
select tests.is_text('Kenya: a sale at 00:30 Nairobi counts as today (not yesterday UTC)',
  $q$select public.financial_summary(7)->'revenue'->>'today'$q$, '7');
select tests.is_text('Kenya: the last daily bucket is the Nairobi business date',
  $q$select (d->>'day') || '=' || (d->>'total') from jsonb_array_elements(public.financial_summary(7)->'revenue'->'daily') d
     order by d->>'day' desc limit 1$q$,
  to_char((now() at time zone 'Africa/Nairobi')::date, 'YYYY-MM-DD') || '=7');
select tests.is_text('Kenya: the 23:30 sale lands on the previous business day',
  $q$select (d->>'total') from jsonb_array_elements(public.financial_summary(7)->'revenue'->'daily') d
     order by d->>'day' desc offset 1 limit 1$q$, '100');
select tests.is_text('Kenya: summary reports the server-resolved business date',
  $q$select public.financial_summary(7)->>'business_date'$q$,
  to_char((now() at time zone 'Africa/Nairobi')::date, 'YYYY-MM-DD'));

select tests.login('ownerRW');
set role authenticated;
select tests.is_text('Rwanda: a sale at 01:30 Kigali (23:30 UTC) counts as today',
  $q$select public.financial_summary(7)->'revenue'->>'today'$q$, '1500');
select tests.is_text('Rwanda: the last daily bucket is the Kigali business date',
  $q$select (d->>'day') || '=' || (d->>'total') from jsonb_array_elements(public.financial_summary(7)->'revenue'->'daily') d
     order by d->>'day' desc limit 1$q$,
  to_char((now() at time zone 'Africa/Kigali')::date, 'YYYY-MM-DD') || '=1500');

select tests.login('ownerA');
set role authenticated;
select tests.is('Liberia: one second after midnight counts as today, one second before does not',
  $q$select count(*) from jsonb_array_elements(public.financial_summary(1)->'revenue'->'daily') d where (d->>'total')::numeric < 1000$q$, 1);
select tests.is_text('Liberia summary is still USD on Africa/Monrovia',
  $q$select (public.financial_summary(1)->>'currency') || ' ' || (public.financial_summary(1)->>'timezone')$q$, 'USD Africa/Monrovia');
select tests.is('Liberia: no other currencies are mixed into the totals',
  $q$select jsonb_array_length(public.financial_summary(30)->'other_currencies')$q$, 0);
reset role;

-- A purchase recorded directly in another currency (e.g. an import) is
-- reported separately, never added into the operating-currency total.
insert into public.purchases (pharmacy_id, customer_id, items_text, amount, method, currency_code)
values (tests.id('phA'), tests.id('custLR'), 'x', 2500, 'Cash', 'LRD');
select tests.login('ownerA');
set role authenticated;
select tests.is_text('other-currency sales are segmented, not summed',
  $q$select (o->>'currency') || ' ' || (o->>'total') from jsonb_array_elements(public.financial_summary(30)->'other_currencies') o$q$,
  'LRD 2500');
select tests.is('the LRD amount is not in the USD revenue total',
  $q$select (sum(amount) = (public.financial_summary(30)->'revenue'->>'total')::numeric)::int
     from public.purchases where currency_code = 'USD'$q$, 1);
reset role;

-- ---------------------------------------------------------------------------
-- 6b. Nigeria: methods beyond the original five (Card, Bank Transfer)
-- ---------------------------------------------------------------------------
insert into tests.ids (key, id) values ('phNG', gen_random_uuid()), ('ownerNG', gen_random_uuid()), ('custNG', gen_random_uuid())
on conflict (key) do nothing;
insert into auth.users (id, email, aud, role) values (tests.id('ownerNG'), 'ownerNG@test.local', 'authenticated', 'authenticated')
on conflict (id) do nothing;
insert into public.pharmacies (id, name, country_code) values (tests.id('phNG'), 'Lagos Test Pharmacy', 'NG');
insert into public.users_profiles (id, pharmacy_id, role, name) values (tests.id('ownerNG'), tests.id('phNG'), 'owner', 'Owner NG');
insert into public.customers (id, pharmacy_id, phone, first_name, last_name) values (tests.id('custNG'), tests.id('phNG'), '+2348030000001', 'Chidi', 'N');
select tests.login('ownerNG');
set role authenticated;
select tests.lives('a Nigerian card sale is recorded (method outside the original five)',
  format($q$select public.record_purchase(%L, %L, 'Card', null,
      jsonb_build_array(jsonb_build_object('product_id', null, 'name','Paracetamol NG','qty',1,'unit_price',850)))$q$,
    tests.id('phNG'), tests.id('custNG')));
select tests.lives('a Nigerian bank-transfer sale is recorded',
  format($q$select public.record_purchase(%L, %L, 'Bank Transfer', null,
      jsonb_build_array(jsonb_build_object('product_id', null, 'name','ORS NG','qty',2,'unit_price',300)))$q$,
    tests.id('phNG'), tests.id('custNG')));
select tests.throws('Mobile Money is not enabled by default in Nigeria',
  format($q$select public.record_purchase(%L, %L, 'Mobile Money', null,
      jsonb_build_array(jsonb_build_object('product_id', null, 'name','ORS NG','qty',1,'unit_price',300)))$q$,
    tests.id('phNG'), tests.id('custNG')));
select tests.is_text('Nigerian sales are stamped NGN and total 1,450',
  $q$select string_agg(distinct currency_code, ',') || ' ' || sum(amount)::text from public.purchases$q$, 'NGN 1450');
reset role;
select tests.throws('an unknown method is still refused by the table itself',
  format($q$insert into public.purchases (pharmacy_id, customer_id, items_text, amount, method) values (%L, %L, 'x', 1, 'Barter')$q$,
    tests.id('phNG'), tests.id('custNG')));

-- ---------------------------------------------------------------------------
-- 7. Anonymous callers get nothing
-- ---------------------------------------------------------------------------
select tests.login(null);
set role anon;
select tests.throws('anon cannot onboard', $q$select public.onboard_pharmacy('{"name":"X","country_code":"LR"}')$q$);
select tests.throws('anon cannot change settings', $q$select public.update_pharmacy_settings('{"city":"X"}')$q$);
select tests.throws('anon cannot read the country context', 'select public.pharmacy_country_context()');
select tests.sees_nothing('anon cannot read the audit log', 'select count(*) from public.pharmacy_config_changes');
reset role;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (phases 2-9)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'country model tests failed: % of %', v_failed, v_total;
  end if;
end $$;
