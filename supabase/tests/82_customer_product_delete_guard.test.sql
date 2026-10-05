-- NevOut Meds — NV-LEAD-02 regressions (migration 0024): customers and products
-- cannot be hard-deleted through the API, so their sales and stock history cannot
-- be cascaded away without an audit row.
-- Reuses the tests.* scaffolding and fixtures from 10_rls_tenant_security
-- (and tests.login_service from 60_ops_monitoring).
-- Before 0024 the two owner deletes below succeeded and took the history with them.

set client_min_messages = notice;

update public.users_profiles set status = 'active', role = 'owner' where id in (tests.id('ownerA'), tests.id('ownerB'));
update public.users_profiles set status = 'active', role = 'staff' where id in (tests.id('staffA'), tests.id('staffB'));
delete from auth.mfa_factors where user_id in (select id from tests.ids);

-- Fixture: a customer with a credit sale and a product with stock movements (pharmacy A).
insert into tests.ids (key, id) values ('dgCust', gen_random_uuid()), ('dgProd', gen_random_uuid())
on conflict (key) do nothing;
insert into public.products (id, pharmacy_id, name, category, unit_cost, selling_price)
values (tests.id('dgProd'), tests.id('phA'), 'Delete Guard Probe', 'Probe', 1, 4) on conflict (id) do nothing;
insert into public.inventory (pharmacy_id, product_id, stock) values (tests.id('phA'), tests.id('dgProd'), 10)
on conflict (pharmacy_id, product_id) do nothing;
insert into public.customers (id, pharmacy_id, phone, first_name, last_name)
values (tests.id('dgCust'), tests.id('phA'), '+231777008810', 'Delete', 'Guard') on conflict (id) do nothing;

select tests.login('staffA');
set role authenticated;
select tests.lives('fixture: a credit sale for the customer through the hardened RPC',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Credit', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Delete Guard Probe','qty',2,'unit_price',4.00)),
      'nvlead02-fixture-sale-0001')$q$,
    tests.id('phA'), tests.id('dgCust'), tests.id('staffA'), tests.id('dgProd')));
select tests.lives('fixture: a stock adjustment for the product',
  format($q$select public.adjust_stock(%L, %L, 3, 'restock')$q$, tests.id('phA'), tests.id('dgProd')));
reset role;

create table if not exists tests.dg (key text primary key, n bigint);
grant select on tests.dg to authenticated;
insert into tests.dg (key, n) values
  ('purchases', (select count(*) from public.purchases where customer_id = tests.id('dgCust'))),
  ('purchase_items', (select count(*) from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id where p.customer_id = tests.id('dgCust'))),
  ('movements', (select count(*) from public.stock_movements where product_id = tests.id('dgProd'))),
  ('sales_total_cents', (select coalesce(sum(amount), 0) * 100 from public.purchases where pharmacy_id = tests.id('phA')))
on conflict (key) do update set n = excluded.n;
select tests.is('fixture: the customer has a sale with lines',
  $q$select (select n from tests.dg where key = 'purchases') * 10 + least((select n from tests.dg where key = 'purchase_items'), 9)$q$, 11);
select tests.is('fixture: the product has stock movements (sale + adjustment)',
  $q$select n from tests.dg where key = 'movements'$q$, 2);

-- ---------------------------------------------------------------------------
-- Direct API deletes are refused for every pharmacy role
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.throws_code('MFA-complete owner cannot delete a customer through the API',
  format($q$delete from public.customers where id = %L$q$, tests.id('dgCust')), '42501');
select tests.throws_code('MFA-complete owner cannot delete a product through the API',
  format($q$delete from public.products where id = %L$q$, tests.id('dgProd')), '42501');
select tests.throws_code('owner cannot bulk-delete their pharmacy''s customers',
  format($q$delete from public.customers where pharmacy_id = %L$q$, tests.id('phA')), '42501');
select tests.throws_code('owner cannot bulk-delete their pharmacy''s products',
  format($q$delete from public.products where pharmacy_id = %L$q$, tests.id('phA')), '42501');
reset role;

select tests.login('ownerA', 'aal1');
set role authenticated;
select tests.throws('owner at aal1 cannot delete a customer',
  format($q$delete from public.customers where id = %L$q$, tests.id('dgCust')));
reset role;

select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot delete a customer',
  format($q$delete from public.customers where id = %L$q$, tests.id('dgCust')));
select tests.throws('staff cannot delete a product',
  format($q$delete from public.products where id = %L$q$, tests.id('dgProd')));
reset role;

select tests.login('ownerB');
set role authenticated;
select tests.throws('another pharmacy''s owner cannot delete the customer',
  format($q$delete from public.customers where id = %L$q$, tests.id('dgCust')));
select tests.throws('another pharmacy''s owner cannot delete the product',
  format($q$delete from public.products where id = %L$q$, tests.id('dgProd')));
reset role;

select tests.login('admin');
set role authenticated;
select tests.throws('the platform admin cannot hard-delete a customer through the API either',
  format($q$delete from public.customers where id = %L$q$, tests.id('dgCust')));
reset role;

select tests.login(null);
set role anon;
select tests.throws('anonymous callers cannot delete a customer',
  format($q$delete from public.customers where id = %L$q$, tests.id('dgCust')));
reset role;

-- History is intact
select tests.is('the customer still exists', format($q$select count(*) from public.customers where id = %L$q$, tests.id('dgCust')), 1);
select tests.is('the product still exists', format($q$select count(*) from public.products where id = %L$q$, tests.id('dgProd')), 1);
select tests.is('the customer''s sales are intact',
  format($q$select count(*) - (select n from tests.dg where key = 'purchases') from public.purchases where customer_id = %L$q$, tests.id('dgCust')), 0);
select tests.is('the customer''s sale lines are intact',
  format($q$select count(*) - (select n from tests.dg where key = 'purchase_items') from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id where p.customer_id = %L$q$, tests.id('dgCust')), 0);
select tests.is('the product''s stock movements are intact',
  format($q$select count(*) - (select n from tests.dg where key = 'movements') from public.stock_movements where product_id = %L$q$, tests.id('dgProd')), 0);
select tests.is('the product''s inventory row is intact',
  format($q$select count(*) from public.inventory where product_id = %L$q$, tests.id('dgProd')), 1);
select tests.is('the pharmacy''s sales total is unchanged',
  format($q$select coalesce(sum(amount), 0) * 100 - (select n from tests.dg where key = 'sales_total_cents') from public.purchases where pharmacy_id = %L$q$, tests.id('phA')), 0);

-- ---------------------------------------------------------------------------
-- Day-to-day work is unaffected
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner can still register a customer',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name) values (%L, '+231777008811', 'Still', 'Works')$q$, tests.id('phA')));
select tests.lives('owner can still edit a customer',
  format($q$update public.customers set notes = 'nv-lead-02 ok', community = 'Sinkor' where id = %L$q$, tests.id('dgCust')));
select tests.lives('owner can still create a product (create_product)',
  format($q$select public.create_product(p_pharmacy_id => %L, p_name => 'Delete Guard New', p_category => 'Probe',
            p_unit_cost => 1, p_selling_price => 2, p_stock => 5)$q$, tests.id('phA')));
select tests.lives('owner can still edit a product directly',
  format($q$update public.products set selling_price = 4.5 where id = %L$q$, tests.id('dgProd')));
select tests.lives('product import upsert (PostgREST form) still works',
  format($q$insert into public.products (pharmacy_id, name, category, unit_cost, selling_price)
            values (%L, 'Delete Guard Probe', 'Probe', 1, 5), (%L, 'Delete Guard Imported', 'Probe', 1, 2)
            on conflict (pharmacy_id, name) do update set pharmacy_id = excluded.pharmacy_id, name = excluded.name,
              category = excluded.category, unit_cost = excluded.unit_cost, selling_price = excluded.selling_price$q$,
    tests.id('phA'), tests.id('phA')));
select tests.lives('customer import upsert (PostgREST form) still works',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name, community)
            values (%L, '+231777008811', 'Still', 'Imported', 'Paynesville')
            on conflict (pharmacy_id, phone) do update set pharmacy_id = excluded.pharmacy_id, phone = excluded.phone,
              first_name = excluded.first_name, last_name = excluded.last_name, community = excluded.community$q$, tests.id('phA')));
select tests.is('stock import still applies',
  format($q$select (public.import_inventory_levels(%L, '[{"product_name": "Delete Guard Probe", "stock": "20"}]'::jsonb)->>'applied')::int$q$, tests.id('phA')), 1);
reset role;

select tests.login('staffA');
set role authenticated;
select tests.lives('staff can still sell (hardened RPC)',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Delete Guard Probe','qty',1,'unit_price',5.00)),
      'nvlead02-cash-sale-0002')$q$,
    tests.id('phA'), tests.id('dgCust'), tests.id('staffA'), tests.id('dgProd')));
select tests.lives('staff can still adjust stock',
  format($q$select public.adjust_stock(%L, %L, -1, 'damaged')$q$, tests.id('phA'), tests.id('dgProd')));
select tests.lives('staff can still create a reminder for the customer',
  format($q$insert into public.reminders (pharmacy_id, customer_id, medicine, due_date) values (%L, %L, 'Delete Guard Probe', current_date + 7)$q$,
    tests.id('phA'), tests.id('dgCust')));
reset role;
select tests.is('stock after import (20), sale (-1) and adjustment (-1) is 18',
  format($q$select stock from public.inventory where product_id = %L$q$, tests.id('dgProd')), 18);

-- Tenant isolation unchanged
select tests.login('ownerB');
set role authenticated;
select tests.sees_nothing('pharmacy B still cannot read pharmacy A''s customer',
  format($q$select count(*) from public.customers where id = %L$q$, tests.id('dgCust')));
select tests.no_effect('pharmacy B still cannot edit pharmacy A''s product',
  format($q$update public.products set selling_price = 0 where id = %L$q$, tests.id('dgProd')));
reset role;

-- Operator maintenance (service role) keeps DELETE
select tests.login_service();
set role service_role;
select tests.lives('service role can still delete (operator maintenance)',
  format($q$delete from public.customers where pharmacy_id = %L and phone = '+231777008811'$q$, tests.id('phA')));
reset role;

-- Catalogue checks
select tests.is('authenticated holds no DELETE on customers or products',
  $q$select count(*) from (values ('public.customers'), ('public.products')) t(r) where has_table_privilege('authenticated', r, 'DELETE')$q$, 0);
select tests.is('anon holds no DELETE on customers or products',
  $q$select count(*) from (values ('public.customers'), ('public.products')) t(r) where has_table_privilege('anon', r, 'DELETE')$q$, 0);
select tests.is('no delete policy remains on customers or products',
  $q$select count(*) from pg_policy where polcmd = 'd' and polrelid in ('public.customers'::regclass, 'public.products'::regclass)$q$, 0);
select tests.is('suppliers, catalogue and purchase orders keep their owner delete policies',
  $q$select count(*) from pg_policy where polcmd = 'd' and polrelid in ('public.suppliers'::regclass, 'public.supplier_catalogue'::regclass, 'public.purchase_orders'::regclass)$q$, 3);
select tests.is('authenticated keeps SELECT, INSERT and UPDATE on customers and products',
  $q$select count(*) from (values ('public.customers'), ('public.products')) t(r)
     where has_table_privilege('authenticated', r, 'SELECT')
       -- customers INSERT/UPDATE are column-level since 0022 (SA-01)
       and (has_table_privilege('authenticated', r, 'INSERT') or has_any_column_privilege('authenticated', r, 'INSERT'))
       and (has_table_privilege('authenticated', r, 'UPDATE') or has_any_column_privilege('authenticated', r, 'UPDATE'))$q$, 2);

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (phases 2-11 + final audit + NV-IMP-02 + NV-LEAD-02)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'customer/product delete guard tests failed: % of %', v_failed, v_total;
  end if;
end $$;
