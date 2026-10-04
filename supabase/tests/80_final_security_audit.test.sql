-- NevOut Meds — final pre-pilot security audit regressions (migration 0022).
-- Reuses the tests.* scaffolding and fixtures from 10_rls_tenant_security.
-- Each block first states the attack that succeeded before 0022.

set client_min_messages = notice;

update public.users_profiles set status = 'active', role = 'owner' where id in (tests.id('ownerA'), tests.id('ownerB'));
update public.users_profiles set status = 'active', role = 'staff' where id in (tests.id('staffA'), tests.id('staffB'));
delete from auth.mfa_factors where user_id in (select id from tests.ids);
create table if not exists tests.sa (key text primary key, n numeric);
grant select, insert, update on tests.sa to authenticated;

-- ---------------------------------------------------------------------------
-- SA-01 (P1): staff rewrote customer money fields through PostgREST
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot zero a customer''s credit balance directly',
  format($q$update public.customers set credit_balance = 0 where id = %L$q$, tests.id('custA')));
select tests.throws('staff cannot rewrite total spend directly',
  format($q$update public.customers set total_spend = 123456 where id = %L$q$, tests.id('custA')));
select tests.throws('staff cannot rewrite visit count / last visit directly',
  format($q$update public.customers set visit_count = 0, last_visit = null where id = %L$q$, tests.id('custA')));
select tests.throws('staff cannot create a customer with an invented balance',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name, credit_balance)
            values (%L, '+231777008001', 'Fake', 'Debt', 500)$q$, tests.id('phA')));
select tests.lives('staff can still register a customer with ordinary fields',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name, notes, credit_limit, conditions, allergies)
            values (%L, '+231777008002', 'Plain', 'Customer', 'n', 10, '{}', '{}')$q$, tests.id('phA')));
select tests.lives('staff can still edit ordinary customer fields',
  format($q$update public.customers set notes = 'updated', community = 'Sinkor', credit_limit = 20 where id = %L$q$, tests.id('custA')));
-- Exactly what PostgREST issues for the spreadsheet import (every payload column is SET).
select tests.lives('import upsert (PostgREST form) of ordinary fields still works',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name, community, county, landmark, credit_limit)
            values (%L, '+231777008002', 'Plain', 'Renamed', null, null, null, 5)
            on conflict (pharmacy_id, phone) do update set pharmacy_id = excluded.pharmacy_id, phone = excluded.phone,
              first_name = excluded.first_name, last_name = excluded.last_name, community = excluded.community,
              county = excluded.county, landmark = excluded.landmark, credit_limit = excluded.credit_limit$q$, tests.id('phA')));
select tests.no_effect('staff still cannot move a customer to another pharmacy',
  format($q$update public.customers set pharmacy_id = %L where id = %L$q$, tests.id('phB'), tests.id('custA')));
reset role;

insert into tests.sa (key, n) select 'credit_before', credit_balance from public.customers where id = tests.id('custA')
on conflict (key) do update set n = excluded.n;
select tests.login('staffA');
set role authenticated;
select tests.lives('a credit sale through the hardened RPC still updates the balance',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Credit', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',1,'unit_price',2.00)),
      'sa01-credit-sale-0001')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
reset role;
select tests.is('credit balance grew by exactly the credit sale',
  format($q$select (credit_balance - (select n from tests.sa where key = 'credit_before'))::bigint from public.customers where id = %L$q$, tests.id('custA')), 2);

-- ---------------------------------------------------------------------------
-- SA-02 (P2): a replay answered before authorising the caller
-- ---------------------------------------------------------------------------
select tests.login('ownerB');
set role authenticated;
select tests.throws('another tenant replaying pharmacy A''s key gets an error, not A''s result',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', null, '[]'::jsonb, 'sa01-credit-sale-0001')$q$,
    tests.id('phA'), tests.id('custA')));
select tests.throws('another tenant cannot read A''s stock level through an adjust-stock replay',
  format($q$select public.adjust_stock_idempotent(%L, %L, 1, 'restock', 'sa01-credit-sale-0001')$q$, tests.id('phA'), tests.id('prodA')));
reset role;

select tests.login('outsider');
set role authenticated;
select tests.throws('an account with no pharmacy cannot replay a key',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', null, '[]'::jsonb, 'sa01-credit-sale-0001')$q$,
    tests.id('phA'), tests.id('custA')));
reset role;

select tests.login('ownerA', 'aal1');
set role authenticated;
select tests.throws('an owner at aal1 (two-step not done) cannot replay a key',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Cash', null, '[]'::jsonb, 'sa01-credit-sale-0001')$q$,
    tests.id('phA'), tests.id('custA')));
reset role;

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner suspends staff A', format($q$select public.suspend_staff(%L)$q$, tests.id('staffA')));
reset role;
select tests.login('staffA');
set role authenticated;
select tests.throws('a suspended account cannot replay its own earlier key',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Credit', %L, '[]'::jsonb, 'sa01-credit-sale-0001')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA')));
reset role;
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner reactivates staff A', format($q$select public.reactivate_staff(%L)$q$, tests.id('staffA')));
reset role;

insert into tests.sa (key, n) values ('purchases_before', (select count(*) from public.purchases))
on conflict (key) do update set n = excluded.n;
select tests.login('staffA');
set role authenticated;
select tests.lives('the legitimate device replay is still accepted',
  format($q$select public.record_purchase_idempotent(%L, %L, 'Credit', %L,
      jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',1,'unit_price',2.00)),
      'sa01-credit-sale-0001')$q$,
    tests.id('phA'), tests.id('custA'), tests.id('staffA'), tests.id('prodA')));
select tests.throws('a sale key cannot be replayed as a different action',
  format($q$select public.create_product_idempotent(%L, 'Key Confusion', 'General', 1, 1, 0, 'sa01-credit-sale-0001')$q$, tests.id('phA')));
reset role;
select tests.is('the replay created no second purchase',
  $q$select (select count(*) from public.purchases) - (select n from tests.sa where key = 'purchases_before')::bigint$q$, 0);

-- ---------------------------------------------------------------------------
-- SA-03 (P2): an owner-role invitation outlived the owner who issued it
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner A issues an owner-role invitation',
  $q$select public.invite_staff('sa03-owner@test.local', 'Co Owner', 'owner')$q$);
select tests.lives('owner A issues a staff invitation',
  $q$select public.invite_staff('sa03-staff@test.local', 'New Staff', 'staff')$q$);
reset role;
select set_config('request.jwt.claims', '', false);
update public.users_profiles set status = 'suspended' where id = tests.id('ownerA');
select tests.is('suspending the inviter revokes every invitation they issued',
  $q$select count(*) from public.staff_invitations where email in ('sa03-owner@test.local','sa03-staff@test.local')
     and accepted_at is null and revoked_at is null$q$, 0);
update public.users_profiles set status = 'active' where id = tests.id('ownerA');

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner A invites again', $q$select public.invite_staff('sa03-again@test.local', 'Again', 'staff')$q$);
reset role;
select set_config('request.jwt.claims', '', false);
update public.users_profiles set role = 'staff' where id = tests.id('ownerA');
select tests.is('losing the invite capability (demotion) revokes pending invitations',
  $q$select count(*) from public.staff_invitations where email = 'sa03-again@test.local' and revoked_at is null$q$, 0);
update public.users_profiles set role = 'owner' where id = tests.id('ownerA');

select tests.login('ownerA');
set role authenticated;
select tests.lives('an unrelated profile change does not touch invitations',
  $q$select public.invite_staff('sa03-kept@test.local', 'Kept', 'staff')$q$);
reset role;
select set_config('request.jwt.claims', '', false);
update public.users_profiles set name = 'Owner A renamed' where id = tests.id('ownerA');
update public.users_profiles set status = 'active' where id = tests.id('ownerA');
select tests.is('a still-authorised inviter keeps their pending invitation',
  $q$select count(*) from public.staff_invitations where email = 'sa03-kept@test.local' and revoked_at is null$q$, 1);

-- ---------------------------------------------------------------------------
-- SA-04 (P3): TRUNCATE / TRIGGER / REFERENCES reached the API roles
-- ---------------------------------------------------------------------------
select tests.is('no public table grants TRUNCATE, TRIGGER or REFERENCES to authenticated or anon',
  $q$select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p')
       and (has_table_privilege('authenticated', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'TRIGGER')
         or has_table_privilege('authenticated', c.oid, 'REFERENCES') or has_table_privilege('anon', c.oid, 'TRUNCATE'))$q$, 0);
select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot truncate the staff audit log', 'truncate public.staff_audit_log');
select tests.throws('staff cannot truncate idempotency receipts', 'truncate public.mutation_receipts');
reset role;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (phases 2-11 + final audit)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'final security audit tests failed: % of %', v_failed, v_total;
  end if;
end $$;
