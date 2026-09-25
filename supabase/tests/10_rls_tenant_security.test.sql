-- NevOut Meds — executable RLS / tenant-security tests.
-- Run by supabase/tests/run_local_validation.sh against a fresh database.
--
-- Each check prints "ok N - ..." or "not ok N - ...". The file raises at the
-- end if any check failed, so the harness reports FAIL.
--
-- Requests are simulated exactly the way PostgREST runs them: `set role
-- authenticated|anon` plus the JWT claims GUCs that auth.uid() reads.

set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Test scaffolding
-- ---------------------------------------------------------------------------
drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated;

create table tests.ids (key text primary key, id uuid not null);
create table tests.results (n serial primary key, ok boolean not null, description text not null, ms numeric);
grant select on tests.ids to anon, authenticated;
grant insert, select on tests.results to anon, authenticated;
grant usage on sequence tests.results_n_seq to anon, authenticated;

create function tests.id(p_key text) returns uuid language sql stable as $$
  select id from tests.ids where key = p_key
$$;

create function tests.report(p_ok boolean, p_desc text, p_ms numeric default null) returns void language plpgsql as $$
declare v_n int;
begin
  insert into tests.results (ok, description, ms) values (coalesce(p_ok, false), p_desc, p_ms) returning n into v_n;
  raise notice '% % - % (%ms)', case when coalesce(p_ok, false) then 'ok' else 'not ok' end, v_n, p_desc, round(coalesce(p_ms, 0));
end $$;

-- A statement_timeout cancellation (57014) never counts as a pass: it would
-- otherwise disguise a hang as a correctly rejected statement.
create function tests.is_cancel(p_state text) returns boolean language sql immutable as $$
  select p_state = '57014'
$$;

-- Switch the simulated JWT (the caller still needs `set role ...`).
-- Sessions default to aal2: these suites model a fully signed-in person (owners
-- must use MFA since 0020). 70_capabilities_mfa passes 'aal1' to test the gate.
create function tests.login(p_key text, p_aal text default 'aal2') returns void language plpgsql as $$
declare v_sub text := case when p_key is null then '' else tests.id(p_key)::text end;
begin
  perform set_config('request.jwt.claim.sub', v_sub, false);
  perform set_config('request.jwt.claim.role', case when p_key is null then 'anon' else 'authenticated' end, false);
  perform set_config('request.jwt.claims',
    case when p_key is null then '{"role":"anon"}'
         else json_build_object('sub', v_sub, 'role', 'authenticated', 'aal', p_aal)::text end, false);
end $$;

-- Statement must fail (any error).
create function tests.throws(p_desc text, p_sql text) returns void language plpgsql as $$
declare t0 timestamptz := clock_timestamp();
begin
  execute p_sql;
  perform tests.report(false, p_desc || ' [statement succeeded]', extract(epoch from clock_timestamp()-t0)*1000);
exception when others then
  perform tests.report(not tests.is_cancel(sqlstate), p_desc || ' [' || sqlerrm || ']', extract(epoch from clock_timestamp()-t0)*1000);
end $$;

-- Statement must succeed.
create function tests.lives(p_desc text, p_sql text) returns void language plpgsql as $$
declare t0 timestamptz := clock_timestamp();
begin
  execute p_sql;
  perform tests.report(true, p_desc, extract(epoch from clock_timestamp()-t0)*1000);
exception when others then
  perform tests.report(false, p_desc || ' [' || sqlerrm || ']', extract(epoch from clock_timestamp()-t0)*1000);
end $$;

-- Statement must fail OR affect zero rows (RLS silently filters UPDATE/DELETE).
create function tests.no_effect(p_desc text, p_sql text) returns void language plpgsql as $$
declare v_rows bigint; t0 timestamptz := clock_timestamp();
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  perform tests.report(v_rows = 0, p_desc || ' [' || v_rows || ' row(s) affected]', extract(epoch from clock_timestamp()-t0)*1000);
exception when others then
  perform tests.report(not tests.is_cancel(sqlstate), p_desc || ' [' || sqlerrm || ']', extract(epoch from clock_timestamp()-t0)*1000);
end $$;

-- Scalar query must equal expected; an error counts as failure.
create function tests.is(p_desc text, p_sql text, p_expected bigint) returns void language plpgsql as $$
declare v bigint; t0 timestamptz := clock_timestamp();
begin
  execute p_sql into v;
  perform tests.report(v is not distinct from p_expected, p_desc || ' [got ' || coalesce(v::text, 'null') || ', want ' || p_expected || ']', extract(epoch from clock_timestamp()-t0)*1000);
exception when others then
  perform tests.report(false, p_desc || ' [' || sqlerrm || ']', extract(epoch from clock_timestamp()-t0)*1000);
end $$;

-- Scalar query must be 0 rows OR fail (for anon: permission denied is fine).
create function tests.sees_nothing(p_desc text, p_sql text) returns void language plpgsql as $$
declare v bigint; t0 timestamptz := clock_timestamp();
begin
  execute p_sql into v;
  perform tests.report(coalesce(v, 0) = 0, p_desc || ' [got ' || coalesce(v::text, 'null') || ' rows]', extract(epoch from clock_timestamp()-t0)*1000);
exception when others then
  perform tests.report(not tests.is_cancel(sqlstate), p_desc || ' [' || sqlerrm || ']', extract(epoch from clock_timestamp()-t0)*1000);
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner, bypassing RLS)
-- ---------------------------------------------------------------------------
insert into tests.ids (key, id) values
  ('phA', gen_random_uuid()), ('phB', gen_random_uuid()), ('phHQ', gen_random_uuid()),
  ('ownerA', gen_random_uuid()), ('staffA', gen_random_uuid()),
  ('ownerB', gen_random_uuid()), ('staffB', gen_random_uuid()),
  ('admin', gen_random_uuid()), ('outsider', gen_random_uuid()),
  ('custA', gen_random_uuid()), ('custB', gen_random_uuid()),
  ('prodA', gen_random_uuid()), ('prodB', gen_random_uuid()),
  ('supA', gen_random_uuid()), ('supB', gen_random_uuid());

insert into auth.users (id, email, aud, role)
select id, key || '@test.local', 'authenticated', 'authenticated'
from tests.ids where key in ('ownerA','staffA','ownerB','staffB','admin','outsider');

insert into public.pharmacies (id, name) values
  (tests.id('phA'), 'Pharmacy A'), (tests.id('phB'), 'Pharmacy B'), (tests.id('phHQ'), 'NevOut HQ');

insert into public.users_profiles (id, pharmacy_id, role, name) values
  (tests.id('ownerA'), tests.id('phA'), 'owner', 'Owner A'),
  (tests.id('staffA'), tests.id('phA'), 'staff', 'Staff A'),
  (tests.id('ownerB'), tests.id('phB'), 'owner', 'Owner B'),
  (tests.id('staffB'), tests.id('phB'), 'staff', 'Staff B'),
  (tests.id('admin'),  tests.id('phHQ'), 'admin', 'Platform Admin');
-- 'outsider' is authenticated but has no profile (signed up, never onboarded).

insert into public.customers (id, pharmacy_id, phone, first_name, last_name) values
  (tests.id('custA'), tests.id('phA'), '+231000001', 'Ada', 'A'),
  (tests.id('custB'), tests.id('phB'), '+231000002', 'Ben', 'B');

insert into public.suppliers (id, pharmacy_id, name) values
  (tests.id('supA'), tests.id('phA'), 'Supplier A'), (tests.id('supB'), tests.id('phB'), 'Supplier B');

insert into public.products (id, pharmacy_id, name, category, unit_cost, selling_price) values
  (tests.id('prodA'), tests.id('phA'), 'Paracetamol A', 'Analgesic', 0.5, 1.0),
  (tests.id('prodB'), tests.id('phB'), 'Paracetamol B', 'Analgesic', 0.5, 1.0);

insert into public.inventory (pharmacy_id, product_id, stock) values
  (tests.id('phA'), tests.id('prodA'), 50), (tests.id('phB'), tests.id('prodB'), 50);

-- ---------------------------------------------------------------------------
-- 1. Unauthenticated (anon) requests fail
-- ---------------------------------------------------------------------------
select tests.login(null);
set role anon;
select tests.sees_nothing('anon cannot read customers', 'select count(*) from public.customers');
select tests.sees_nothing('anon cannot read users_profiles', 'select count(*) from public.users_profiles');
select tests.sees_nothing('anon cannot read pharmacies', 'select count(*) from public.pharmacies');
select tests.throws('anon cannot insert a customer',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name) values (%L, '1', 'x', 'y')$q$, tests.id('phA')));
select tests.throws('anon cannot call record_purchase',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, '[{"name":"x","qty":1,"unit_price":1}]'::jsonb)$q$, tests.id('phA'), tests.id('custA')));
select tests.throws('anon cannot call adjust_stock',
  format($q$select public.adjust_stock(%L, %L, 1, null)$q$, tests.id('phA'), tests.id('prodA')));
select tests.throws('anon cannot call onboard_new_pharmacy', $q$select public.onboard_new_pharmacy('Evil')$q$);
select tests.throws('anon cannot call admin_pilot_overview', 'select count(*) from public.admin_pilot_overview()');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Pharmacy A cannot SELECT Pharmacy B
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.is('ownerA sees own customers', 'select count(*) from public.customers', 1);
select tests.is('ownerA cannot select B customers',
  format('select count(*) from public.customers where pharmacy_id = %L', tests.id('phB')), 0);
select tests.is('ownerA cannot select B products',
  format('select count(*) from public.products where pharmacy_id = %L', tests.id('phB')), 0);
select tests.is('ownerA cannot select B inventory',
  format('select count(*) from public.inventory where pharmacy_id = %L', tests.id('phB')), 0);
select tests.is('ownerA cannot select B suppliers',
  format('select count(*) from public.suppliers where pharmacy_id = %L', tests.id('phB')), 0);
select tests.is('ownerA cannot select B profiles',
  format('select count(*) from public.users_profiles where pharmacy_id = %L', tests.id('phB')), 0);
select tests.is('ownerA cannot select pharmacy B',
  format('select count(*) from public.pharmacies where id = %L', tests.id('phB')), 0);
select tests.lives('users_profiles select does not recurse', 'select count(*) from public.users_profiles');

-- ---------------------------------------------------------------------------
-- 3. Pharmacy A cannot UPDATE / DELETE Pharmacy B
-- ---------------------------------------------------------------------------
select tests.no_effect('ownerA cannot update B customer',
  format($q$update public.customers set notes = 'pwned' where id = %L$q$, tests.id('custB')));
select tests.no_effect('ownerA cannot update B product price',
  format($q$update public.products set selling_price = 0 where id = %L$q$, tests.id('prodB')));
select tests.no_effect('ownerA cannot update B inventory',
  format($q$update public.inventory set stock = 0 where product_id = %L$q$, tests.id('prodB')));
select tests.no_effect('ownerA cannot delete B customer',
  format($q$delete from public.customers where id = %L$q$, tests.id('custB')));
select tests.no_effect('ownerA cannot move own customer into B',
  format($q$update public.customers set pharmacy_id = %L where id = %L$q$, tests.id('phB'), tests.id('custA')));

-- ---------------------------------------------------------------------------
-- 4. Pharmacy A cannot INSERT into B or create cross-tenant relationships
-- ---------------------------------------------------------------------------
select tests.throws('ownerA cannot insert customer into B',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name) values (%L, '9', 'x', 'y')$q$, tests.id('phB')));
select tests.throws('ownerA cannot insert purchase_order (A) pointing at supplier B',
  format($q$insert into public.purchase_orders (pharmacy_id, supplier_id) values (%L, %L)$q$, tests.id('phA'), tests.id('supB')));
select tests.throws('ownerA cannot insert reminder (A) for customer B',
  format($q$insert into public.reminders (pharmacy_id, customer_id, medicine, due_date) values (%L, %L, 'x', current_date)$q$, tests.id('phA'), tests.id('custB')));
select tests.throws('ownerA cannot insert inventory (A) for product B',
  format($q$insert into public.inventory (pharmacy_id, product_id, stock) values (%L, %L, 5)$q$, tests.id('phA'), tests.id('prodB')));
select tests.throws('ownerA cannot insert supplier_catalogue (A) for supplier B',
  format($q$insert into public.supplier_catalogue (pharmacy_id, supplier_id, product_name, unit_cost) values (%L, %L, 'x', 1)$q$, tests.id('phA'), tests.id('supB')));
select tests.throws('ownerA cannot insert a purchase directly (must use record_purchase)',
  format($q$insert into public.purchases (pharmacy_id, customer_id, items_text, amount, method) values (%L, %L, 'x', 1, 'Cash')$q$, tests.id('phA'), tests.id('custA')));
select tests.throws('ownerA cannot forge a stock_movement directly',
  format($q$insert into public.stock_movements (pharmacy_id, product_id, delta) values (%L, %L, 1000)$q$, tests.id('phA'), tests.id('prodA')));
select tests.throws('direct inventory write cannot set negative stock',
  format($q$update public.inventory set stock = -5 where product_id = %L$q$, tests.id('prodA')));

-- ---------------------------------------------------------------------------
-- 5. record_purchase hardening
-- ---------------------------------------------------------------------------
select tests.throws('record_purchase rejects foreign pharmacy_id',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, '[{"name":"x","qty":1,"unit_price":1}]'::jsonb)$q$, tests.id('phB'), tests.id('custB')));
select tests.throws('record_purchase rejects foreign-tenant customer',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, '[{"name":"x","qty":1,"unit_price":1}]'::jsonb)$q$, tests.id('phA'), tests.id('custB')));
select tests.throws('record_purchase rejects foreign-tenant product',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','x','qty',1,'unit_price',1)))$q$, tests.id('phA'), tests.id('custA'), tests.id('prodB')));
select tests.throws('record_purchase rejects negative quantity',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','x','qty',-3,'unit_price',1)))$q$, tests.id('phA'), tests.id('custA'), tests.id('prodA')));
select tests.throws('record_purchase rejects zero quantity',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, '[{"name":"x","qty":0,"unit_price":1}]'::jsonb)$q$, tests.id('phA'), tests.id('custA')));
select tests.throws('record_purchase rejects negative price',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, '[{"name":"x","qty":1,"unit_price":-1}]'::jsonb)$q$, tests.id('phA'), tests.id('custA')));
select tests.throws('record_purchase rejects invalid payment method',
  format($q$select public.record_purchase(%L, %L, 'Bitcoin', null, '[{"name":"x","qty":1,"unit_price":1}]'::jsonb)$q$, tests.id('phA'), tests.id('custA')));
select tests.throws('record_purchase rejects empty item list',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, '[]'::jsonb)$q$, tests.id('phA'), tests.id('custA')));
select tests.throws('record_purchase rejects overselling tracked stock',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','x','qty',51,'unit_price',1)))$q$, tests.id('phA'), tests.id('custA'), tests.id('prodA')));
select tests.throws('record_purchase rejects spoofed staff_id',
  format($q$select public.record_purchase(%L, %L, 'Cash', %L, '[{"name":"x","qty":1,"unit_price":1}]'::jsonb)$q$, tests.id('phA'), tests.id('custA'), tests.id('staffA')));
reset role;

select tests.login('staffA');
set role authenticated;
select tests.lives('staffA can record a valid purchase in own pharmacy',
  format($q$select public.record_purchase(%L, %L, 'Credit', %L, jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',2,'unit_price',1.5)))$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
reset role;
select tests.is('valid purchase decremented stock exactly (50 -> 48)',
  format('select stock from public.inventory where product_id = %L', tests.id('prodA')), 48);
select tests.is('valid purchase stamped staff_id = caller',
  format('select count(*) from public.purchases where customer_id = %L and staff_id = %L', tests.id('custA'), tests.id('staffA')), 1);
select tests.is('credit purchase raised customer credit balance to 3',
  format('select credit_balance::bigint from public.customers where id = %L', tests.id('custA')), 3);
select tests.is('B stock untouched by all of the above',
  format('select stock from public.inventory where product_id = %L', tests.id('prodB')), 50);

-- ---------------------------------------------------------------------------
-- 6. adjust_stock hardening
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.throws('adjust_stock rejects foreign pharmacy_id',
  format($q$select public.adjust_stock(%L, %L, 5, null)$q$, tests.id('phB'), tests.id('prodB')));
select tests.throws('adjust_stock rejects foreign-tenant product under own pharmacy',
  format($q$select public.adjust_stock(%L, %L, 5, null)$q$, tests.id('phA'), tests.id('prodB')));
select tests.throws('adjust_stock rejects a mutation below zero',
  format($q$select public.adjust_stock(%L, %L, -1000, null)$q$, tests.id('phA'), tests.id('prodA')));
select tests.throws('adjust_stock rejects zero delta',
  format($q$select public.adjust_stock(%L, %L, 0, null)$q$, tests.id('phA'), tests.id('prodA')));
select tests.lives('adjust_stock accepts a valid delta',
  format($q$select public.adjust_stock(%L, %L, -8, 'count correction')$q$, tests.id('phA'), tests.id('prodA')));
reset role;
select tests.is('adjust_stock applied exactly (48 -> 40)',
  format('select stock from public.inventory where product_id = %L', tests.id('prodA')), 40);

-- ---------------------------------------------------------------------------
-- 7. Staff cannot change own role / tenant; staff cannot manage users
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.no_effect('staff cannot promote self to owner',
  format($q$update public.users_profiles set role = 'owner' where id = %L$q$, tests.id('staffA')));
select tests.no_effect('staff cannot promote self to admin',
  format($q$update public.users_profiles set role = 'admin' where id = %L$q$, tests.id('staffA')));
select tests.no_effect('staff cannot move self to pharmacy B',
  format($q$update public.users_profiles set pharmacy_id = %L where id = %L$q$, tests.id('phB'), tests.id('staffA')));
select tests.throws('staff cannot insert a new profile',
  format($q$insert into public.users_profiles (id, pharmacy_id, role, name) values (%L, %L, 'staff', 'x')$q$, tests.id('outsider'), tests.id('phA')));
select tests.no_effect('staff cannot demote the owner',
  format($q$update public.users_profiles set role = 'staff' where id = %L$q$, tests.id('ownerA')));
select tests.lives('staff can update own last_seen_at',
  format($q$update public.users_profiles set last_seen_at = now() where id = %L$q$, tests.id('staffA')));
select tests.lives('staff can create a customer in own pharmacy',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name) values (%L, '+231000003', 'Cee', 'A')$q$, tests.id('phA')));
reset role;
select tests.is('staffA role still staff after attempts',
  format($q$select count(*) from public.users_profiles where id = %L and role = 'staff' and pharmacy_id = %L$q$, tests.id('staffA'), tests.id('phA')), 1);

select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot forge purchase_order attribution to another user',
  format($q$insert into public.purchase_orders (pharmacy_id, supplier_id, created_by) values (%L, %L, %L)$q$,
    tests.id('phA'), tests.id('supA'), tests.id('ownerA')));
select tests.throws('staff cannot upload a document (owner/admin only)',
  format($q$insert into public.documents (pharmacy_id, name, category) values (%L, 'x', 'licence')$q$, tests.id('phA')));
reset role;

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner can upload a document in own pharmacy',
  format($q$insert into public.documents (pharmacy_id, name, category, uploaded_by) values (%L, 'Licence', 'licence', %L)$q$,
    tests.id('phA'), tests.id('ownerA')));
select tests.throws('owner cannot forge document attribution to another user',
  format($q$insert into public.documents (pharmacy_id, name, category, uploaded_by) values (%L, 'x', 'licence', %L)$q$,
    tests.id('phA'), tests.id('staffA')));
reset role;

-- ---------------------------------------------------------------------------
-- 8. Owner cannot create or promote an admin, nor touch pharmacy B users
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.throws('owner cannot insert an admin profile',
  format($q$insert into public.users_profiles (id, pharmacy_id, role, name) values (%L, %L, 'admin', 'x')$q$, tests.id('outsider'), tests.id('phA')));
select tests.no_effect('owner cannot promote staff to admin (direct update)',
  format($q$update public.users_profiles set role = 'admin' where id = %L$q$, tests.id('staffA')));
select tests.no_effect('owner cannot promote self to admin',
  format($q$update public.users_profiles set role = 'admin' where id = %L$q$, tests.id('ownerA')));
select tests.no_effect('owner cannot move staff into pharmacy B',
  format($q$update public.users_profiles set pharmacy_id = %L where id = %L$q$, tests.id('phB'), tests.id('staffA')));
select tests.no_effect('owner A cannot modify staff of pharmacy B',
  format($q$update public.users_profiles set name = 'pwned' where id = %L$q$, tests.id('staffB')));
select tests.no_effect('owner A cannot delete staff of pharmacy B',
  format($q$delete from public.users_profiles where id = %L$q$, tests.id('staffB')));
reset role;
select tests.is('no admin besides the seeded one',
  $q$select count(*) from public.users_profiles where role = 'admin'$q$, 1);

-- ---------------------------------------------------------------------------
-- 9. Onboarding cannot be used to hop tenants
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.is('onboard_new_pharmacy for an existing member returns own pharmacy, creates nothing',
  format($q$select (public.onboard_new_pharmacy('Hop') = %L)::int$q$, tests.id('phA')), 1);
reset role;
select tests.is('no pharmacy named Hop exists', $q$select count(*) from public.pharmacies where name = 'Hop'$q$, 0);

-- ---------------------------------------------------------------------------
-- 10. Admin access only where explicitly intended
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.sees_nothing('non-admin gets nothing from admin_pilot_overview', 'select count(*) from public.admin_pilot_overview()');
select tests.sees_nothing('non-admin gets nothing from admin_usage_snapshot', 'select count(*) from public.admin_usage_snapshot(7) where admin_usage_snapshot is not null');
reset role;

select tests.login('admin');
set role authenticated;
select tests.is('admin sees every pharmacy in admin_pilot_overview', 'select count(*) from public.admin_pilot_overview()', 3);
select tests.is('admin can read customers across pharmacies (support)', 'select count(*) from public.customers', 3);
select tests.no_effect('admin cannot edit another pharmacy''s customer (read-only support)',
  format($q$update public.customers set notes = 'admin edit' where id = %L$q$, tests.id('custB')));
select tests.throws('admin cannot record a purchase in another pharmacy',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, '[{"name":"x","qty":1,"unit_price":1}]'::jsonb)$q$, tests.id('phB'), tests.id('custB')));
reset role;

-- ---------------------------------------------------------------------------
-- 11. Authenticated user without a profile has no tenant access
-- ---------------------------------------------------------------------------
select tests.login('outsider');
set role authenticated;
select tests.is('profile-less user sees no customers', 'select count(*) from public.customers', 0);
select tests.throws('profile-less user cannot insert a customer anywhere',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name) values (%L, '7', 'x', 'y')$q$, tests.id('phA')));
reset role;

-- ---------------------------------------------------------------------------
-- 12. Structural guarantees
-- ---------------------------------------------------------------------------
select tests.is('no SECURITY DEFINER function without a pinned search_path',
  $q$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public','private') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')$q$, 0);
select tests.is('anon cannot execute any public function',
  $q$select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('anon', p.oid, 'execute')$q$, 0);
select tests.is('anon holds no privileges on public tables',
  $q$select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'$q$, 0);
select tests.is('RLS helpers do not read users_profiles as SECURITY INVOKER',
  $q$select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('current_profile','is_admin','same_pharmacy') and not p.prosecdef
     and p.prosrc ilike '%users_profiles%'$q$, 0);

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks, % failed, slowest %ms', v_total, v_failed, (select round(max(ms)) from tests.results);
  if v_failed > 0 then
    raise exception 'RLS security tests failed: % of %', v_failed, v_total;
  end if;
end $$;
