-- NevOut Meds — Phase 11: capabilities, MFA assurance and privilege-escalation attacks (0020).
-- Reuses the tests.* scaffolding and fixtures from 10_rls_tenant_security.
--
-- Sessions are simulated with request.jwt.claims. The `aal` claim is what Supabase
-- Auth signs into every access token; tests.login(key, 'aal1' | 'aal2') sets it.

set client_min_messages = notice;

-- Known state for the fixtures this suite relies on (earlier suites suspend some).
update public.users_profiles set status = 'active'
where id in (tests.id('ownerA'), tests.id('staffA'), tests.id('ownerB'), tests.id('staffB'), tests.id('admin'));
delete from auth.mfa_factors where user_id in (select id from tests.ids);

insert into public.customers (pharmacy_id, phone, first_name, last_name)
values (tests.id('phA'), '+231777000070', 'Mfa', 'Probe')
on conflict do nothing;
insert into public.documents (pharmacy_id, name, category, size)
values (tests.id('phA'), 'staff contract (test).pdf', 'staff', 1000);

-- A verified TOTP factor, as Supabase Auth stores it after a successful enrollment.
create or replace function tests.give_factor(p_key text, p_status text default 'verified') returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  values (v_id, tests.id(p_key), 'test-' || left(v_id::text, 8), 'totp', p_status::auth.factor_status, now(), now(), 'NOT-A-REAL-SECRET');
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Capability registry
-- ---------------------------------------------------------------------------
select tests.is('every role-capability row names a registered capability',
  $q$select count(*) from private.role_capabilities rc left join private.capabilities c using (capability) where c.capability is null$q$, 0);
select tests.is('staff hold exactly the 15 counter capabilities',
  $q$select count(*) from private.role_capabilities where role = 'staff'$q$, 15);
select tests.is('staff hold no privileged capability',
  $q$select count(*) from private.role_capabilities where role = 'staff' and capability in
     ('staff.invite','staff.manage','staff.role.manage','staff.audit.read','staff.read','financials.read','documents.read',
      'documents.manage','inventory.import','pharmacy.settings.manage','customers.delete','inventory.delete','platform.admin')$q$, 0);
select tests.is('the registry holds 32 capabilities', 'select count(*) from private.capabilities', 32);
select tests.is('owners hold every capability except platform.admin',
  $q$select (select count(*) from private.capabilities) - 1 - (select count(*) from private.role_capabilities where role = 'owner')$q$, 0);
select tests.is('only admins hold platform.admin',
  $q$select count(*) from private.role_capabilities where capability = 'platform.admin' and role <> 'admin'$q$, 0);
select tests.is('MFA policy: owner and admin required, staff optional',
  $q$select count(*) from private.mfa_policy where (role in ('owner','admin') and mfa_required) or (role = 'staff' and not mfa_required)$q$, 3);

select tests.login('staffA', 'aal1');
set role authenticated;
select tests.throws('authenticated cannot read the capability table directly', 'select count(*) from private.capabilities');
select tests.throws('authenticated cannot rewrite the role map', $q$insert into private.role_capabilities values ('staff', 'staff.invite')$q$);
select tests.throws('authenticated cannot relax the MFA policy', $q$update private.mfa_policy set mfa_required = false$q$);
reset role;

-- ---------------------------------------------------------------------------
-- 2. MFA gate: an owner with only a password (aal1) has NO tenant access
-- ---------------------------------------------------------------------------
select tests.login('ownerA', 'aal1');
set role authenticated;
select tests.is('owner at aal1: tenant helper returns nothing', 'select count(*) from (select private.pharmacy_id() p) x where p is not null', 0);
select tests.sees_nothing('owner at aal1 cannot read customers', 'select count(*) from public.customers');
select tests.sees_nothing('owner at aal1 cannot read sales', 'select count(*) from public.purchases');
select tests.sees_nothing('owner at aal1 cannot read documents', 'select count(*) from public.documents');
select tests.throws('owner at aal1 cannot record a sale (RPC)',
  format($q$select public.record_purchase(%L, null, 'Cash', %L, '[]'::jsonb)$q$, tests.id('phA'), tests.id('ownerA')));
select tests.throws('owner at aal1 cannot invite staff (RPC behind the Edge Function)',
  $q$select public.invite_staff('aal1-invite@test.local', 'X', 'staff')$q$);
select tests.throws('owner at aal1 cannot suspend staff',
  format($q$select public.suspend_staff(%L)$q$, tests.id('staffA')));
select tests.throws('owner at aal1 cannot change roles',
  format($q$select public.set_staff_role(%L, 'owner')$q$, tests.id('staffA')));
select tests.throws('owner at aal1 cannot read financials', 'select public.financial_summary(30)');
select tests.throws('owner at aal1 cannot change pharmacy settings',
  $q$select public.update_pharmacy_settings('{"city":"Nowhere"}'::jsonb)$q$);
select tests.no_effect('owner at aal1 cannot update the pharmacy row',
  format($q$update public.pharmacies set city = 'Nowhere' where id = %L$q$, tests.id('phA')));
select tests.is('owner at aal1 can still read their own profile (to learn their role)',
  format($q$select count(*) from public.users_profiles where id = %L$q$, tests.id('ownerA')), 1);
select tests.is('owner at aal1: posture says MFA required, not satisfied, no capabilities',
  $q$select count(*) from (select public.my_security_posture() p) x
     where (p->>'mfa_required')::boolean and not (p->>'mfa_satisfied')::boolean and jsonb_array_length(p->'capabilities') = 0$q$, 1);
reset role;

select tests.is('the unmet requirement is recorded once as a security event',
  format($q$select count(*) from public.security_events where user_id = %L and event = 'mfa_required_not_enrolled'$q$, tests.id('ownerA')), 1);

select tests.login('ownerA', 'aal1');
set role authenticated;
select public.my_security_posture();
reset role;
select tests.is('a second posture check within 24 h does not duplicate that event',
  format($q$select count(*) from public.security_events where user_id = %L and event = 'mfa_required_not_enrolled'$q$, tests.id('ownerA')), 1);

-- A forged aal claim cannot come from the client: Supabase signs the JWT. What the
-- database sees is what Auth issued. aal2 therefore means "second factor verified".
select tests.login('ownerA', 'aal2');
set role authenticated;
select tests.is('owner at aal2: full owner access to customers', 'select count(*) from public.customers where phone = ''+231777000070''', 1);
select tests.lives('owner at aal2 can read financials', 'select public.financial_summary(30)');
select tests.is('owner at aal2 reads documents', 'select count(*) from public.documents where name = ''staff contract (test).pdf''', 1);
select tests.is('owner at aal2: posture lists owner capabilities',
  $q$select jsonb_array_length(public.my_security_posture()->'capabilities')$q$, 31);
reset role;

select tests.login('admin', 'aal1');
set role authenticated;
select tests.throws('platform admin at aal1 cannot open the admin console', 'select public.admin_pilot_overview()');
select tests.sees_nothing('platform admin at aal1 cannot read across tenants', 'select count(*) from public.customers');
reset role;
select tests.login('admin', 'aal2');
set role authenticated;
select tests.lives('platform admin at aal2 opens the admin console', 'select public.admin_pilot_overview()');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Optional MFA for staff: none → aal1 is fine; once enrolled → aal2 required
-- ---------------------------------------------------------------------------
select tests.login('staffA', 'aal1');
set role authenticated;
select tests.is('staff without a factor work at aal1 (MFA optional)', 'select count(*) from public.customers where phone = ''+231777000070''', 1);
select tests.is('staff posture: not required, satisfied', $q$select count(*) from (select public.my_security_posture() p) x
  where not (p->>'mfa_required')::boolean and (p->>'mfa_satisfied')::boolean$q$, 1);
reset role;

select tests.give_factor('staffA', 'unverified');
select tests.login('staffA', 'aal1');
set role authenticated;
select tests.is('an unfinished (unverified) enrollment does not lock staff out', 'select count(*) from public.customers where phone = ''+231777000070''', 1);
reset role;

select tests.give_factor('staffA', 'verified');
select tests.login('staffA', 'aal1');
set role authenticated;
select tests.sees_nothing('staff with a verified factor need aal2: aal1 sees nothing', 'select count(*) from public.customers');
reset role;
select tests.login('staffA', 'aal2');
set role authenticated;
select tests.is('staff with a verified factor work at aal2', 'select count(*) from public.customers where phone = ''+231777000070''', 1);
reset role;
delete from auth.mfa_factors where user_id = tests.id('staffA');

-- ---------------------------------------------------------------------------
-- 4. Privilege escalation (all at aal2, so only the capability model stands in the way)
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.no_effect('STAFF cannot promote self (direct PostgREST update of role)',
  format($q$update public.users_profiles set role = 'owner' where id = %L$q$, tests.id('staffA')));
select tests.no_effect('STAFF cannot change own pharmacy',
  format($q$update public.users_profiles set pharmacy_id = %L where id = %L$q$, tests.id('phB'), tests.id('staffA')));
select tests.throws('STAFF cannot promote self through the role RPC',
  format($q$select public.set_staff_role(%L, 'owner')$q$, tests.id('staffA')));
select tests.throws('STAFF cannot promote a colleague',
  format($q$select public.set_staff_role(%L, 'staff')$q$, tests.id('ownerA')));
select tests.throws('STAFF cannot invite (owner operation)', $q$select public.invite_staff('esc@test.local', 'X', 'owner')$q$);
select tests.throws('STAFF cannot suspend the owner', format($q$select public.suspend_staff(%L)$q$, tests.id('ownerA')));
select tests.throws('STAFF cannot offboard anyone', format($q$select public.remove_staff(%L)$q$, tests.id('ownerA')));
select tests.throws('STAFF cannot read financials (direct RPC)', 'select public.financial_summary(30)');
select tests.throws('STAFF cannot read staff performance (direct RPC)', 'select public.staff_performance(7)');
select tests.throws('STAFF cannot change pharmacy settings (direct RPC)', $q$select public.update_pharmacy_settings('{"city":"X"}'::jsonb)$q$);
select tests.throws('STAFF cannot import stock levels (direct RPC, finding F1)',
  format($q$select public.import_inventory_levels(%L, '[]'::jsonb)$q$, tests.id('phA')));
select tests.sees_nothing('STAFF cannot read stored documents (finding F2)', 'select count(*) from public.documents');
select tests.sees_nothing('STAFF cannot read the staff audit log', 'select count(*) from public.staff_audit_log');
select tests.sees_nothing('STAFF cannot read invitations', 'select count(*) from public.staff_invitations');
select tests.is('STAFF see only their own profile, not the team', 'select count(*) from public.users_profiles', 1);
select tests.no_effect('STAFF cannot delete a customer', format($q$delete from public.customers where pharmacy_id = %L$q$, tests.id('phA')));
select tests.throws('STAFF cannot open the admin console', 'select public.admin_pilot_overview()');
select tests.throws('STAFF cannot read platform health', 'select public.ops_health(24)');
reset role;

-- A client-edited JWT: extra claims claiming a role or a pharmacy are ignored.
-- (Supabase signs tokens; user_metadata is user-writable. Neither is ever read.)
select set_config('request.jwt.claims', json_build_object(
  'sub', tests.id('staffA'), 'role', 'authenticated', 'aal', 'aal2',
  'user_role', 'owner', 'pharmacy_id', tests.id('phB'),
  'user_metadata', json_build_object('role', 'admin', 'pharmacy_id', tests.id('phB')),
  'app_metadata', json_build_object('role', 'admin'))::text, false);
set role authenticated;
select tests.throws('CLIENT-MODIFIED role claims grant no owner operation', 'select public.financial_summary(30)');
select tests.throws('CLIENT-MODIFIED role claims grant no admin operation', 'select public.admin_pilot_overview()');
select tests.sees_nothing('CLIENT-MODIFIED pharmacy claim does not reach pharmacy B',
  format($q$select count(*) from public.customers where pharmacy_id = %L$q$, tests.id('phB')));
reset role;

-- ---------------------------------------------------------------------------
-- 5. Cross-tenant attacks (owner A, fully authenticated)
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.sees_nothing('PHARMACY A owner cannot read pharmacy B customers (PostgREST)',
  format($q$select count(*) from public.customers where pharmacy_id = %L$q$, tests.id('phB')));
select tests.throws('PHARMACY A owner cannot record a sale into pharmacy B (direct RPC)',
  format($q$select public.record_purchase(%L, null, 'Cash', %L, '[]'::jsonb)$q$, tests.id('phB'), tests.id('ownerA')));
select tests.throws('PHARMACY A owner cannot import into pharmacy B',
  format($q$select public.import_inventory_levels(%L, '[]'::jsonb)$q$, tests.id('phB')));
select tests.throws('PHARMACY A owner cannot suspend pharmacy B staff',
  format($q$select public.suspend_staff(%L)$q$, tests.id('staffB')));
select tests.throws('PHARMACY A owner cannot change pharmacy B roles',
  format($q$select public.set_staff_role(%L, 'owner')$q$, tests.id('staffB')));
select tests.no_effect('PHARMACY A owner cannot move a customer into pharmacy B',
  format($q$update public.customers set pharmacy_id = %L where pharmacy_id = %L$q$, tests.id('phB'), tests.id('phA')));
select tests.sees_nothing('PHARMACY A owner cannot read pharmacy B security events',
  format($q$select count(*) from public.security_events where pharmacy_id = %L$q$, tests.id('phB')));
reset role;

-- ---------------------------------------------------------------------------
-- 6. Suspended and removed accounts, even at aal2
-- ---------------------------------------------------------------------------
update public.users_profiles set status = 'suspended' where id = tests.id('staffA');
select tests.login('staffA');
set role authenticated;
select tests.sees_nothing('SUSPENDED user at aal2 reads nothing', 'select count(*) from public.customers');
select tests.throws('SUSPENDED user at aal2 cannot sell',
  format($q$select public.record_purchase(%L, null, 'Cash', %L, '[]'::jsonb)$q$, tests.id('phA'), tests.id('staffA')));
select tests.is('SUSPENDED user posture carries no capabilities', $q$select jsonb_array_length(public.my_security_posture()->'capabilities')$q$, 0);
reset role;
update public.users_profiles set status = 'removed' where id = tests.id('staffA');
select tests.login('staffA');
set role authenticated;
select tests.sees_nothing('REMOVED user at aal2 reads nothing', 'select count(*) from public.customers');
reset role;
update public.users_profiles set status = 'active' where id = tests.id('staffA');

-- ---------------------------------------------------------------------------
-- 7. Security events: validated, append-only, no secrets
-- ---------------------------------------------------------------------------
select set_config('tests.owner_factor', tests.give_factor('ownerA', 'verified')::text, false);
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner records that their factor was verified',
  format($q$select public.record_security_event('mfa_factor_verified', %L)$q$,
         current_setting('tests.owner_factor')));
select tests.throws('a verification event for a factor that does not exist is refused',
  format($q$select public.record_security_event('mfa_factor_verified', %L)$q$, gen_random_uuid()));
select tests.throws('an enrollment event for an already-verified factor is refused',
  format($q$select public.record_security_event('mfa_enrollment_started', %L)$q$,
         current_setting('tests.owner_factor')));
select tests.throws('a removal event for a factor that still exists is refused',
  format($q$select public.record_security_event('mfa_factor_removed', %L)$q$,
         current_setting('tests.owner_factor')));
select tests.throws('clients cannot invent operator events', $q$select public.record_security_event('mfa_admin_reset', null)$q$);
select tests.throws('security events cannot be inserted directly', format($q$insert into public.security_events (user_id, event) values (%L, 'mfa_factor_verified')$q$, tests.id('ownerA')));
select tests.no_effect('security events cannot be edited', $q$update public.security_events set event = 'mfa_factor_removed'$q$);
select tests.no_effect('security events cannot be deleted', $q$delete from public.security_events$q$);
select tests.is('owner reads their pharmacy''s security events', format($q$select count(*) from public.security_events where pharmacy_id = %L$q$, tests.id('phA')), 2);
reset role;

select tests.login('staffA');
set role authenticated;
select tests.is('staff read only their own security events', 'select count(*) from public.security_events', 0);
reset role;

select tests.is('no security event carries a secret, code, token or QR payload',
  $q$select count(*) from public.security_events where detail::text ~* '(\msecret\M|\motp\M|\mcode\M|token|password|qr_code|\muri\M|otpauth|NOT-A-REAL-SECRET)'$q$, 0);
select tests.is('posture never exposes a factor secret',
  $q$select count(*) from pg_proc where proname in ('my_security_posture','record_security_event','mfa_satisfied')
     and prosrc ~* '\msecret\M'$q$, 0);

delete from auth.mfa_factors where user_id in (select id from tests.ids);

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (phases 2-11)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'capability/MFA tests failed: % of %', v_failed, v_total;
  end if;
end $$;
