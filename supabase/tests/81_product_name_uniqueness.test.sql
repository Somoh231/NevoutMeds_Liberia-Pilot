-- NevOut Meds — NV-IMP-02 regressions (migration 0023): product names are unique
-- per pharmacy regardless of case and spacing, on every write path.
-- Reuses the tests.* scaffolding and fixtures from 10_rls_tenant_security.
-- Before 0023, every "throws" below succeeded and created a second product.

set client_min_messages = notice;

update public.users_profiles set status = 'active', role = 'owner' where id in (tests.id('ownerA'), tests.id('ownerB'));
update public.users_profiles set status = 'active', role = 'staff' where id in (tests.id('staffA'), tests.id('staffB'));
delete from auth.mfa_factors where user_id in (select id from tests.ids);

-- Count of a pharmacy's products whose name is some spelling of p_key (independent of
-- 0023's own helper, so the check means the same thing with or without the migration).
create or replace function tests.amox(p_pharmacy text, p_key text) returns bigint language sql as $$
  select count(*) from public.products
  where pharmacy_id = tests.id(p_pharmacy) and lower(btrim(regexp_replace(name, E'[[:space:]\u00a0]+', ' ', 'g'))) = p_key
$$;
grant execute on function tests.amox(text, text) to authenticated;

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner creates "Amoxicillin 500mg"',
  format($q$select public.create_product(p_pharmacy_id => %L, p_name => 'Amoxicillin 500mg', p_category => 'Antibiotic',
            p_unit_cost => 1, p_selling_price => 2)$q$, tests.id('phA')));
-- create_product / create_product_idempotent (the product form, online or replayed offline)
select tests.throws_code('a case-only duplicate is refused (create_product)',
  format($q$select public.create_product(p_pharmacy_id => %L, p_name => 'amoxicillin 500MG', p_category => 'Antibiotic',
            p_unit_cost => 1, p_selling_price => 2)$q$, tests.id('phA')), '23505');
select tests.throws_code('a spacing-only duplicate is refused (create_product)',
  format($q$select public.create_product(p_pharmacy_id => %L, p_name => E'  Amoxicillin \t  500mg ', p_category => 'Antibiotic',
            p_unit_cost => 1, p_selling_price => 2)$q$, tests.id('phA')), '23505');
-- Direct PostgREST writes (API bypass of the app)
select tests.throws_code('a case-only duplicate is refused (direct insert)',
  format($q$insert into public.products (pharmacy_id, name, category, unit_cost, selling_price)
            values (%L, 'AMOXICILLIN 500MG', 'Antibiotic', 1, 2)$q$, tests.id('phA')), '23505');
select tests.throws_code('a spacing-and-case duplicate is refused (direct insert)',
  format($q$insert into public.products (pharmacy_id, name, category, unit_cost, selling_price)
            values (%L, E'amoxicillin  500mg\n', 'Antibiotic', 1, 2)$q$, tests.id('phA')), '23505');
reset role;
select tests.is('pharmacy A still has exactly one Amoxicillin 500mg', $q$select tests.amox('phA', 'amoxicillin 500mg')$q$, 1);

-- Spreadsheet import (CSV and XLSX both send this PostgREST upsert)
select tests.login('ownerA');
set role authenticated;
select tests.lives('import "add or update": a case/spacing variant updates the existing product',
  format($q$insert into public.products (pharmacy_id, name, category, unit_cost, selling_price)
            values (%L, ' AMOXICILLIN  500mg', 'Antibiotic', 1.5, 3.25)
            on conflict (pharmacy_id, name) do update set pharmacy_id = excluded.pharmacy_id, name = excluded.name,
              category = excluded.category, unit_cost = excluded.unit_cost, selling_price = excluded.selling_price$q$, tests.id('phA')));
select tests.is('import "skip": a case variant inserts nothing',
  format($q$with t as (insert into public.products (pharmacy_id, name, category, unit_cost, selling_price)
            values (%L, 'amoxicillin 500mg', 'Antibiotic', 9, 9)
            on conflict (pharmacy_id, name) do nothing returning id) select count(*) from t$q$, tests.id('phA')), 0);
reset role;
select tests.is('after both imports there is still one Amoxicillin 500mg', $q$select tests.amox('phA', 'amoxicillin 500mg')$q$, 1);
select tests.is_text('"add or update" changed its price but kept its spelling',
  format($q$select name || ' @ ' || selling_price from public.products where pharmacy_id = %L and lower(name) = 'amoxicillin 500mg'$q$, tests.id('phA')),
  'Amoxicillin 500mg @ 3.25');

-- Things that must keep working
select tests.login('ownerA');
set role authenticated;
select tests.lives('a genuinely different product is still allowed ("Amoxicillin 250mg")',
  format($q$select public.create_product(p_pharmacy_id => %L, p_name => 'Amoxicillin 250mg', p_category => 'Antibiotic',
            p_unit_cost => 1, p_selling_price => 2)$q$, tests.id('phA')));
select tests.lives('spacing is normalised on write',
  format($q$select public.create_product(p_pharmacy_id => %L, p_name => E' Ibuprofen \t 200mg  ', p_category => 'Analgesic',
            p_unit_cost => 1, p_selling_price => 2)$q$, tests.id('phA')));
select tests.lives('an owner can change only the case of their own product',
  format($q$update public.products set name = 'AMOXICILLIN 250mg' where pharmacy_id = %L and name = 'Amoxicillin 250mg'$q$, tests.id('phA')));
-- Renames (product edit form → update_product_checked, and direct PATCH)
select tests.throws_code('renaming onto another product in different case is refused (update_product_checked)',
  format($q$select public.update_product_checked(
            (select id from public.products where pharmacy_id = %L and name = 'AMOXICILLIN 250mg'), null,
            '{"name": "amoxicillin 500mg"}'::jsonb)$q$, tests.id('phA')), '23505');
select tests.throws_code('renaming onto another product in different case is refused (direct update)',
  format($q$update public.products set name = 'Amoxicillin  500MG ' where pharmacy_id = %L and name = 'AMOXICILLIN 250mg'$q$, tests.id('phA')), '23505');
reset role;
select tests.is_text('stored name has single spaces and no padding',
  format($q$select name from public.products where pharmacy_id = %L and lower(name) like 'ibuprofen%%'$q$, tests.id('phA')), 'Ibuprofen 200mg');
select tests.is('distinct products stay distinct (500mg and 250mg)',
  format($q$select count(*) from public.products where pharmacy_id = %L and lower(name) in ('amoxicillin 500mg', 'amoxicillin 250mg')$q$, tests.id('phA')), 2);

select tests.login('ownerB');
set role authenticated;
select tests.lives('the same name is still allowed in another pharmacy',
  format($q$select public.create_product(p_pharmacy_id => %L, p_name => 'amoxicillin 500mg', p_category => 'Antibiotic',
            p_unit_cost => 1, p_selling_price => 2)$q$, tests.id('phB')));
select tests.lives('a pharmacy B import does not pick up pharmacy A''s spelling',
  format($q$insert into public.products (pharmacy_id, name, category, unit_cost, selling_price)
            values (%L, 'AMOXICILLIN 500MG', 'Antibiotic', 1, 2)
            on conflict (pharmacy_id, name) do update set selling_price = excluded.selling_price$q$, tests.id('phB')));
reset role;
select tests.is_text('pharmacy B keeps its own spelling',
  format($q$select string_agg(name, ',') from public.products where pharmacy_id = %L and lower(name) = 'amoxicillin 500mg'$q$, tests.id('phB')),
  'amoxicillin 500mg');
select tests.is_text('pharmacy A''s product is untouched by pharmacy B',
  format($q$select name || ' @ ' || selling_price from public.products where pharmacy_id = %L and lower(name) = 'amoxicillin 500mg'$q$, tests.id('phA')),
  'Amoxicillin 500mg @ 3.25');

-- Stock import now has exactly one product to match
select tests.login('ownerA');
set role authenticated;
select tests.is('stock import by a case variant updates the single matching product',
  format($q$select (public.import_inventory_levels(%L, '[{"product_name": "AMOXICILLIN 500MG", "stock": "7"}]'::jsonb)->>'applied')::int$q$, tests.id('phA')), 1);
reset role;
select tests.is('its stock is 7',
  format($q$select inv.stock from public.inventory inv join public.products p on p.id = inv.product_id
            where p.pharmacy_id = %L and lower(p.name) = 'amoxicillin 500mg'$q$, tests.id('phA')), 7);

select tests.is('the case-insensitive index exists',
  $q$select count(*) from pg_indexes where schemaname = 'public' and indexname = 'products_pharmacy_name_ci_unique'$q$, 1);

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (phases 2-11 + final audit + NV-IMP-02)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'product name uniqueness tests failed: % of %', v_failed, v_total;
  end if;
end $$;
