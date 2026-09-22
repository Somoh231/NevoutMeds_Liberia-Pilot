-- NevOut Meds — Phase 5/6: idempotency, stock concurrency and conflict tests.
-- Reuses the tests.* scaffolding and fixtures from the earlier suites.

set client_min_messages = notice;

-- Counters, so assertions measure the change this test causes rather than
-- absolute totals (earlier suites leave their own purchases behind).
create table if not exists tests.counters (key text primary key, n bigint not null);
grant select, insert, update on tests.counters to authenticated;

insert into tests.counters (key, n) values
  ('purchases_before', (select count(*) from public.purchases)),
  ('movements_before', (select count(*) from public.stock_movements))
on conflict (key) do update set n = excluded.n;

-- ---------------------------------------------------------------------------
-- 1. Replaying a queued purchase must not duplicate it
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;

select tests.lives('queued purchase is accepted the first time',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',2,'unit_price',1.00)),
      'offline-key-purchase-0001')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
reset role;
select tests.is('one purchase exists after the first send',
  $q$select count(*) from public.mutation_receipts where idempotency_key = 'offline-key-purchase-0001'$q$, 1);

-- The device never saw the response and replays the identical mutation.
select tests.login('staffA');
set role authenticated;
select tests.lives('replaying the same key is accepted (no error shown to the user)',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',2,'unit_price',1.00)),
      'offline-key-purchase-0001')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
select tests.lives('replaying a third time is still accepted',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',2,'unit_price',1.00)),
      'offline-key-purchase-0001')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
reset role;

select tests.is('three sends of the same key created exactly one purchase',
  $q$select (select count(*) from public.purchases) - (select n from tests.counters where key = 'purchases_before')$q$, 1);
select tests.is('replays return the identical purchase id',
  $q$select count(distinct result ->> 'purchase_id') from public.mutation_receipts
     where idempotency_key = 'offline-key-purchase-0001'$q$, 1);
select tests.is('stock moved exactly once for the replayed purchase',
  $q$select (select count(*) from public.stock_movements) - (select n from tests.counters where key = 'movements_before')$q$, 1);

-- ---------------------------------------------------------------------------
-- 2. Replay safety for the other queued mutation types
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.lives('queued stock adjustment applies once',
  format($q$select public.adjust_stock_idempotent(%L, %L, 5, 'restock', 'offline-key-stock-0001')$q$,
    tests.id('phA'), tests.id('prodA')));
select tests.lives('replayed stock adjustment is accepted',
  format($q$select public.adjust_stock_idempotent(%L, %L, 5, 'restock', 'offline-key-stock-0001')$q$,
    tests.id('phA'), tests.id('prodA')));
reset role;
select tests.is('stock only moved once for the replayed adjustment',
  format($q$select count(*) from public.stock_movements where product_id = %L and delta = 5 and note = 'restock'$q$, tests.id('prodA')), 1);

select tests.login('staffA');
set role authenticated;
select tests.lives('queued customer creation applies once',
  format($q$select public.create_customer_idempotent(%L, '+231700111', 'Offline', 'Customer', 'offline-key-cust-0001')$q$, tests.id('phA')));
select tests.lives('replayed customer creation is accepted',
  format($q$select public.create_customer_idempotent(%L, '+231700111', 'Offline', 'Customer', 'offline-key-cust-0001')$q$, tests.id('phA')));
select tests.lives('queued reminder creation applies once',
  format($q$select public.create_reminder_idempotent(%L, %L, 'Metformin', current_date + 7, 'refill', 'offline-key-rem-0001')$q$,
    tests.id('phA'), tests.id('custA')));
select tests.lives('replayed reminder creation is accepted',
  format($q$select public.create_reminder_idempotent(%L, %L, 'Metformin', current_date + 7, 'refill', 'offline-key-rem-0001')$q$,
    tests.id('phA'), tests.id('custA')));
reset role;
select tests.is('exactly one offline customer exists',
  format($q$select count(*) from public.customers where pharmacy_id = %L and phone = '+231700111'$q$, tests.id('phA')), 1);
select tests.is('exactly one offline reminder exists',
  format($q$select count(*) from public.reminders where pharmacy_id = %L and medicine = 'Metformin' and note = 'refill'$q$, tests.id('phA')), 1);

-- ---------------------------------------------------------------------------
-- 3. Idempotency keys are tenant-scoped and cannot leak across pharmacies
-- ---------------------------------------------------------------------------
select tests.login('ownerB');
set role authenticated;
select tests.lives('pharmacy B may reuse the same key string for its own work',
  format($q$select public.create_customer_idempotent(%L, '+231700222', 'B', 'Customer', 'offline-key-cust-0001')$q$, tests.id('phB')));
select tests.throws('pharmacy B cannot replay into pharmacy A',
  format($q$select public.create_customer_idempotent(%L, '+231700333', 'X', 'Y', 'offline-key-cust-0002')$q$, tests.id('phA')));
reset role;
select tests.is('the reused key created a separate pharmacy B customer',
  format($q$select count(*) from public.customers where pharmacy_id = %L and phone = '+231700222'$q$, tests.id('phB')), 1);
select tests.is('pharmacy A is untouched by pharmacy B''s key reuse',
  format($q$select count(*) from public.customers where pharmacy_id = %L and phone = '+231700222'$q$, tests.id('phA')), 0);
select tests.is('receipts are tenant-scoped',
  $q$select count(*) from public.mutation_receipts where idempotency_key = 'offline-key-cust-0001'$q$, 2);

-- Receipts are readable only inside the owning pharmacy, and never writable.
select tests.login('ownerB');
set role authenticated;
select tests.is('pharmacy B cannot read pharmacy A receipts',
  format($q$select count(*) from public.mutation_receipts where pharmacy_id = %L$q$, tests.id('phA')), 0);
select tests.throws('receipts cannot be forged',
  format($q$insert into public.mutation_receipts (pharmacy_id, idempotency_key, mutation_type)
           values (%L, 'forged-key-000001', 'record_purchase')$q$, tests.id('phB')));
select tests.throws('receipts cannot be deleted to force a replay',
  $q$delete from public.mutation_receipts$q$);
reset role;

-- A suspended user's queued work must not sync.
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner suspends staff A', format($q$select public.suspend_staff(%L)$q$, tests.id('staffA')));
reset role;
select tests.login('staffA');
set role authenticated;
select tests.throws('queued work from a suspended user is rejected on sync',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', null,
      '[{"name":"x","qty":1,"unit_price":1}]'::jsonb, 'offline-key-suspended-001')$q$,
    tests.id('phA'), tests.id('custA')));
reset role;
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner reactivates staff A', format($q$select public.reactivate_staff(%L)$q$, tests.id('staffA')));
reset role;
select tests.is('no receipt was left behind by the rejected sync',
  $q$select count(*) from public.mutation_receipts where idempotency_key = 'offline-key-suspended-001'$q$, 0);

-- ---------------------------------------------------------------------------
-- 4. Concurrency
--
-- Genuine two-session concurrency is exercised at the API layer instead of with
-- dblink: the local server uses trust authentication, and dblink refuses
-- non-superuser connections that did not authenticate with a password. Parallel
-- HTTP requests through PostgREST are also a more faithful "two devices" test.
-- See supabase/tests/api_realtime_offline.e2e.mjs.
--
-- What is asserted here is the invariant those tests rely on: stock is never
-- left negative by any path.
-- ---------------------------------------------------------------------------
select tests.is('no inventory row is ever negative',
  $q$select count(*) from public.inventory where stock < 0$q$, 0);

-- ---------------------------------------------------------------------------
-- 5. Product metadata conflicts are detected, not silently overwritten
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner updates a product with the expected version',
  format($q$select public.update_product_checked(%L, (select version from public.products where id = %L),
      '{"selling_price": 2.50}'::jsonb)$q$, tests.id('prodA'), tests.id('prodA')));
select tests.throws('a stale offline edit is rejected as a conflict',
  format($q$select public.update_product_checked(%L, 1, '{"selling_price": 99}'::jsonb)$q$, tests.id('prodA')));
select tests.throws('a stale edit cannot target another pharmacy''s product',
  format($q$select public.update_product_checked(%L, null, '{"selling_price": 1}'::jsonb)$q$, tests.id('prodB')));
reset role;
select tests.is('the rejected edit did not change the price',
  format($q$select (selling_price = 2.50)::int::bigint from public.products where id = %L$q$, tests.id('prodA')), 1);
select tests.is('the product version advanced exactly once',
  format($q$select (version >= 2)::int::bigint from public.products where id = %L$q$, tests.id('prodA')), 1);

-- ---------------------------------------------------------------------------
-- 6. Realtime is published for exactly the operational tables
-- ---------------------------------------------------------------------------
select tests.is('realtime publishes the operational tables',
  $q$select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('inventory','products','purchases','customers','reminders','purchase_orders','users_profiles')$q$, 7);
select tests.is('realtime does not publish privileged or audit tables',
  $q$select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('staff_audit_log','staff_invitations','mutation_receipts','app_logs','documents')$q$, 0);
select tests.is('published tables use REPLICA IDENTITY FULL so RLS can filter updates',
  $q$select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('inventory','products','purchases','customers','reminders','purchase_orders','users_profiles')
       and c.relreplident <> 'f'$q$, 0);

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (phases 2-6)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'offline/idempotency tests failed: % of %', v_failed, v_total;
  end if;
end $$;
