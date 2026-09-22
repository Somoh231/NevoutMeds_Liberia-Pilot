-- NevOut Meds — Phase 3 data-correctness tests.
-- Runs after 10_rls_tenant_security.test.sql, reusing its tests.* scaffolding
-- and fixtures (pharmacies A/B, ownerA/staffA/ownerB, admin, products, stock).

set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- 1. Customer creation persists, and stays inside the tenant
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.lives('customer creation persists for staff',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name, community)
           values (%L, '+231777001', 'Grace', 'Toe', 'Sinkor')$q$, tests.id('phA')));
reset role;
select tests.is('created customer is readable back from the database',
  format($q$select count(*) from public.customers where pharmacy_id = %L and phone = '+231777001'$q$, tests.id('phA')), 1);

select tests.login('ownerB');
set role authenticated;
select tests.is('pharmacy B cannot see pharmacy A''s new customer',
  $q$select count(*) from public.customers where phone = '+231777001'$q$, 0);
reset role;

-- Same-pharmacy multi-user visibility: the owner sees what staff created.
select tests.login('ownerA');
set role authenticated;
select tests.is('owner sees the customer that staff created (same pharmacy)',
  $q$select count(*) from public.customers where phone = '+231777001'$q$, 1);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Product creation is atomic (product + inventory + opening movement)
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.lives('create_product creates product, inventory and opening movement',
  format($q$select public.create_product(%L, 'Zinc Sulfate 20mg', 'Supplement', 0.10, 0.25, 40)$q$, tests.id('phA')));
select tests.throws('create_product rejects a foreign pharmacy',
  format($q$select public.create_product(%L, 'Sneaky', 'Cat', 1, 2, 1)$q$, tests.id('phB')));
select tests.throws('create_product rejects negative stock',
  format($q$select public.create_product(%L, 'Bad Stock', 'Cat', 1, 2, -5)$q$, tests.id('phA')));
select tests.throws('create_product rejects a blank name',
  format($q$select public.create_product(%L, '   ', 'Cat', 1, 2, 1)$q$, tests.id('phA')));
reset role;
select tests.is('atomic product: inventory row created with the opening stock',
  format($q$select i.stock from public.inventory i join public.products p on p.id = i.product_id
           where p.pharmacy_id = %L and p.name = 'Zinc Sulfate 20mg'$q$, tests.id('phA')), 40);
select tests.is('atomic product: opening stock movement recorded',
  format($q$select count(*) from public.stock_movements sm join public.products p on p.id = sm.product_id
           where p.name = 'Zinc Sulfate 20mg' and sm.note = 'opening stock' and sm.delta = 40$q$), 1);
select tests.is('failed product creation left nothing behind',
  $q$select count(*) from public.products where name in ('Sneaky','Bad Stock')$q$, 0);

-- ---------------------------------------------------------------------------
-- 3. Purchase orders are atomic and server-priced
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.lives('create_purchase_order writes order + lines in one transaction',
  format($q$select public.create_purchase_order(%L, %L,
      jsonb_build_array(
        jsonb_build_object('product_id', %L::text, 'name', 'Para A', 'qty', 10, 'unit_price', 0.40),
        jsonb_build_object('name', 'Gloves', 'qty', 5, 'unit_price', 2.00)),
      'order via whatsapp')$q$,
    tests.id('phA'), tests.id('supA'), tests.id('prodA')));
select tests.throws('create_purchase_order rejects a foreign-tenant supplier',
  format($q$select public.create_purchase_order(%L, %L, '[{"name":"x","qty":1,"unit_price":1}]'::jsonb)$q$,
    tests.id('phA'), tests.id('supB')));
select tests.throws('create_purchase_order rejects a foreign-tenant product',
  format($q$select public.create_purchase_order(%L, %L, jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','x','qty',1,'unit_price',1)))$q$,
    tests.id('phA'), tests.id('supA'), tests.id('prodB')));
select tests.throws('create_purchase_order rejects zero quantity',
  format($q$select public.create_purchase_order(%L, %L, '[{"name":"x","qty":0,"unit_price":1}]'::jsonb)$q$,
    tests.id('phA'), tests.id('supA')));
select tests.throws('create_purchase_order rejects a negative price',
  format($q$select public.create_purchase_order(%L, %L, '[{"name":"x","qty":1,"unit_price":-2}]'::jsonb)$q$,
    tests.id('phA'), tests.id('supA')));
select tests.throws('create_purchase_order rejects an empty basket',
  format($q$select public.create_purchase_order(%L, %L, '[]'::jsonb)$q$, tests.id('phA'), tests.id('supA')));
reset role;
select tests.is('purchase order total computed server-side (10*0.40 + 5*2.00 = 14)',
  format($q$select total::bigint from public.purchase_orders where pharmacy_id = %L order by created_at desc limit 1$q$, tests.id('phA')), 14);
select tests.is('purchase order has both lines',
  format($q$select count(*) from public.purchase_order_items where pharmacy_id = %L$q$, tests.id('phA')), 2);
select tests.is('rejected purchase orders left no orphan lines',
  format($q$select count(*) from public.purchase_orders where pharmacy_id = %L$q$, tests.id('phA')), 1);

-- ---------------------------------------------------------------------------
-- 4. Staff performance comes from real purchases
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.is('staff_performance lists the pharmacy''s real members only',
  'select count(*) from public.staff_performance(7)', 2);
select tests.is('staff_performance attributes real sales to the staff member who made them',
  format($q$select transactions from public.staff_performance(7) where user_id = %L$q$, tests.id('staffA')), 1);
select tests.is('staff_performance reports zero for a member with no sales',
  format($q$select transactions from public.staff_performance(7) where user_id = %L$q$, tests.id('ownerA')), 0);
reset role;

select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot read staff_performance (owner only)', 'select count(*) from public.staff_performance(7)');
reset role;

select tests.login('ownerB');
set role authenticated;
select tests.is('pharmacy B sees only its own staff', 'select count(*) from public.staff_performance(7)', 2);
select tests.is('pharmacy B sees no sales from pharmacy A',
  'select coalesce(sum(sales_total), 0)::bigint from public.staff_performance(7)', 0);
reset role;

-- ---------------------------------------------------------------------------
-- 5. Financial summary is real, and declares what it cannot know
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.is('financial_summary revenue equals the recorded purchases (3.00)',
  $q$select ((public.financial_summary(30) -> 'revenue' ->> 'total')::numeric)::bigint$q$, 3);
select tests.is('financial_summary counts the real transactions',
  $q$select ((public.financial_summary(30) -> 'revenue' ->> 'transactions')::int)::bigint$q$, 1);
select tests.is('financial_summary reports outstanding credit from customers',
  $q$select ((public.financial_summary(30) -> 'credit' ->> 'outstanding')::numeric)::bigint$q$, 3);
select tests.is('financial_summary declares untracked figures instead of inventing them',
  $q$select jsonb_array_length(public.financial_summary(30) -> 'not_tracked')::bigint$q$, 4);
select tests.is('financial_summary values inventory at cost from real stock',
  $q$select ((public.financial_summary(30) -> 'inventory_value' ->> 'at_cost')::numeric > 0)::int::bigint$q$, 1);
reset role;

select tests.login('ownerB');
set role authenticated;
select tests.is('pharmacy B financials exclude pharmacy A revenue',
  $q$select ((public.financial_summary(30) -> 'revenue' ->> 'total')::numeric)::bigint$q$, 0);
reset role;

select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot read financial_summary (owner only)', 'select public.financial_summary(30)');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Telemetry FK / nullability consistency
-- ---------------------------------------------------------------------------
select tests.is('app_feedback.user_id is nullable (its FK is ON DELETE SET NULL)',
  $q$select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'app_feedback'
       and column_name = 'user_id' and is_nullable = 'YES'$q$, 1);
select tests.is('app_feedback user FK is ON DELETE SET NULL',
  $q$select count(*) from pg_constraint where conname = 'app_feedback_pharmacy_user_fkey' and confdeltype = 'n'$q$, 1);
select tests.is('app_events user FK is ON DELETE CASCADE (column is NOT NULL)',
  $q$select count(*) from pg_constraint where conname = 'app_events_pharmacy_user_fkey' and confdeltype = 'c'$q$, 1);

-- Deleting a profile must not break feedback history.
do $$
declare v_id uuid := gen_random_uuid(); v_ph uuid := tests.id('phA');
begin
  insert into auth.users (id, email, aud, role) values (v_id, 'leaver@test.local', 'authenticated', 'authenticated');
  insert into public.users_profiles (id, pharmacy_id, role, name) values (v_id, v_ph, 'staff', 'Leaver');
  insert into public.app_feedback (pharmacy_id, user_id, kind, title) values (v_ph, v_id, 'issue', 'kept after leaving');
  insert into public.app_events (pharmacy_id, user_id, event_name) values (v_ph, v_id, 'module_view');
  delete from public.users_profiles where id = v_id;
end $$;
select tests.is('feedback survives staff removal with user_id set to null',
  $q$select count(*) from public.app_feedback where title = 'kept after leaving' and user_id is null$q$, 1);
select tests.is('events are removed with the staff member (NOT NULL column)',
  $q$select count(*) from public.app_events where user_id is null$q$, 0);

-- ---------------------------------------------------------------------------
-- 7. Same-pharmacy multi-user: one user's writes are visible to the other
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.lives('staff records a second sale',
  format($q$select public.record_purchase(%L, %L, 'Cash', %L, jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',1,'unit_price',2.00)))$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
reset role;

select tests.login('ownerA');
set role authenticated;
select tests.is('owner immediately sees the sale staff just recorded',
  format($q$select count(*) from public.purchases where pharmacy_id = %L and staff_id = %L$q$, tests.id('phA'), tests.id('staffA')), 2);
select tests.is('owner sees the shared stock level after the staff sale (40 -> 39)',
  format($q$select stock from public.inventory where product_id = %L$q$, tests.id('prodA')), 39);
select tests.is('owner financials include the staff sale (3.00 + 2.00)',
  $q$select ((public.financial_summary(30) -> 'revenue' ->> 'total')::numeric)::bigint$q$, 5);
reset role;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (includes phase 2 suite)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'data-correctness tests failed: % of %', v_failed, v_total;
  end if;
end $$;
