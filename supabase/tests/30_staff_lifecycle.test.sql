-- NevOut Meds — Phase 4 staff-lifecycle and suspension tests.
-- Runs after the Phase 2/3 suites and reuses their tests.* scaffolding and
-- fixtures (pharmacies A/B, ownerA/staffA/ownerB/staffB, admin).

set client_min_messages = notice;

-- Auth identities for people who will accept invitations.
insert into tests.ids (key, id) values
  ('inviteeA', gen_random_uuid()),
  ('inviteeA2', gen_random_uuid()),
  ('inviteeB', gen_random_uuid()),
  ('wrongEmail', gen_random_uuid());

insert into auth.users (id, email, aud, role)
select id, key || '@test.local', 'authenticated', 'authenticated'
from tests.ids where key in ('inviteeA','inviteeA2','inviteeB','wrongEmail');

create table if not exists tests.tokens (key text primary key, token text not null);
grant select, insert on tests.tokens to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Invitations: who may create them, and for what role
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot invite staff',
  $q$select public.invite_staff('nope@test.local', 'Nope', 'staff')$q$);
reset role;

select tests.login('ownerA');
set role authenticated;
select tests.throws('owner cannot invite a platform admin',
  $q$select public.invite_staff('evil@test.local', 'Evil', 'admin')$q$);
select tests.throws('invite rejects a malformed email',
  $q$select public.invite_staff('not-an-email', 'X', 'staff')$q$);
select tests.lives('owner can invite staff to own pharmacy',
  $q$insert into tests.tokens (key, token)
     select 'inviteeA', (public.invite_staff('inviteea@test.local', 'Invitee A', 'staff') ->> 'token')$q$);
select tests.throws('owner cannot invite somebody already on the team',
  format($q$select public.invite_staff(%L, 'Dup', 'staff')$q$, 'staffa@test.local'));
reset role;

select tests.is('invitation is bound to the inviting owner''s pharmacy',
  format($q$select count(*) from public.staff_invitations
           where email = 'inviteea@test.local' and pharmacy_id = %L and invited_by = %L and role = 'staff'$q$,
    tests.id('phA'), tests.id('ownerA')), 1);
select tests.is('invitation stores only a hash, never the token',
  $q$select count(*) from public.staff_invitations i join tests.tokens t on t.key = 'inviteeA'
     where i.email = 'inviteea@test.local' and i.token_hash = t.token$q$, 0);
select tests.is('invitation starts as pending',
  $q$select count(*) from public.staff_invitations i
     where i.email = 'inviteea@test.local' and public.invitation_status(i) = 'pending'$q$, 1);

-- Pharmacy B owner invites into pharmacy B only.
select tests.login('ownerB');
set role authenticated;
select tests.lives('owner B can invite into pharmacy B',
  $q$insert into tests.tokens (key, token)
     select 'inviteeB', (public.invite_staff('inviteeb@test.local', 'Invitee B', 'staff') ->> 'token')$q$);
select tests.throws('owner B cannot revoke pharmacy A''s invitation',
  format($q$select public.revoke_staff_invitation((select id from public.staff_invitations where email = 'inviteea@test.local'))$q$));
reset role;
select tests.is('owner B''s invitation is bound to pharmacy B',
  format($q$select count(*) from public.staff_invitations where email = 'inviteeb@test.local' and pharmacy_id = %L$q$,
    tests.id('phB')), 1);

-- ---------------------------------------------------------------------------
-- 2. Acceptance
-- ---------------------------------------------------------------------------
select tests.login('wrongEmail');
set role authenticated;
select tests.throws('invitation cannot be accepted from a different email address',
  $q$select public.accept_staff_invitation((select token from tests.tokens where key = 'inviteeA'))$q$);
select tests.throws('a malformed token is rejected',
  $q$select public.accept_staff_invitation('not-a-real-token')$q$);
select tests.throws('an empty token is rejected',
  $q$select public.accept_staff_invitation('')$q$);
reset role;

select tests.login('inviteeA');
set role authenticated;
select tests.lives('invited person accepts their invitation',
  $q$select public.accept_staff_invitation((select token from tests.tokens where key = 'inviteeA'))$q$);
select tests.throws('the same invitation cannot be used twice',
  $q$select public.accept_staff_invitation((select token from tests.tokens where key = 'inviteeA'))$q$);
reset role;

select tests.is('accepted staff receives the invitation''s pharmacy_id',
  format($q$select count(*) from public.users_profiles where id = %L and pharmacy_id = %L$q$,
    tests.id('inviteeA'), tests.id('phA')), 1);
select tests.is('accepted staff receives the invitation''s role (staff, never admin)',
  format($q$select count(*) from public.users_profiles where id = %L and role = 'staff' and status = 'active'$q$,
    tests.id('inviteeA')), 1);
select tests.is('invitation is marked accepted',
  $q$select count(*) from public.staff_invitations i
     where i.email = 'inviteea@test.local' and public.invitation_status(i) = 'accepted'$q$, 1);
select tests.is('acceptance is audited',
  format($q$select count(*) from public.staff_audit_log
           where action = 'invitation_accepted' and target_user_id = %L and pharmacy_id = %L$q$,
    tests.id('inviteeA'), tests.id('phA')), 1);

-- A second account cannot reuse an accepted invitation, and an existing member
-- cannot hop pharmacies with someone else's invite.
select tests.login('inviteeA2');
set role authenticated;
select tests.throws('an accepted invitation cannot be reused by another account',
  $q$select public.accept_staff_invitation((select token from tests.tokens where key = 'inviteeA'))$q$);
reset role;

select tests.login('staffB');
set role authenticated;
select tests.throws('an existing member cannot accept an invitation into another pharmacy',
  $q$select public.accept_staff_invitation((select token from tests.tokens where key = 'inviteeB'))$q$);
reset role;

-- Expired and revoked invitations.
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner invites a second person',
  $q$insert into tests.tokens (key, token)
     select 'expiring', (public.invite_staff('expiring@test.local', 'Expiring', 'staff') ->> 'token')$q$);
reset role;
update public.staff_invitations set expires_at = now() - interval '1 hour' where email = 'expiring@test.local';
select tests.is('an expired invitation reports itself as expired',
  $q$select count(*) from public.staff_invitations i where i.email = 'expiring@test.local' and public.invitation_status(i) = 'expired'$q$, 1);

select tests.login('inviteeA2');
set role authenticated;
select tests.throws('an expired invitation cannot be accepted',
  $q$select public.accept_staff_invitation((select token from tests.tokens where key = 'expiring'))$q$);
reset role;

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner resends the expired invitation (new token, new expiry)',
  $q$insert into tests.tokens (key, token)
     select 'resent', (public.resend_staff_invitation(
       (select id from public.staff_invitations where email = 'expiring@test.local')) ->> 'token')$q$);
reset role;
select tests.is('the resent invitation is pending again',
  $q$select count(*) from public.staff_invitations i where i.email = 'expiring@test.local' and public.invitation_status(i) = 'pending'$q$, 1);
select tests.is('the superseded token no longer matches any invitation',
  $q$select count(*) from public.staff_invitations i, tests.tokens t
     where t.key = 'expiring' and i.token_hash = encode(extensions.digest(t.token, 'sha256'), 'hex')$q$, 0);

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner revokes the invitation',
  $q$select public.revoke_staff_invitation((select id from public.staff_invitations where email = 'expiring@test.local'))$q$);
reset role;
select tests.login('inviteeA2');
set role authenticated;
select tests.throws('a revoked invitation cannot be accepted',
  $q$select public.accept_staff_invitation((select token from tests.tokens where key = 'resent'))$q$);
reset role;

-- ---------------------------------------------------------------------------
-- 3. The newly accepted staff member works inside their pharmacy only
-- ---------------------------------------------------------------------------
select tests.login('inviteeA');
set role authenticated;
select tests.is('new staff sees pharmacy A customers', 'select count(*) from public.customers', 3);
select tests.is('new staff sees nothing from pharmacy B',
  format('select count(*) from public.customers where pharmacy_id = %L', tests.id('phB')), 0);
select tests.lives('new staff can record a purchase in pharmacy A',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','Paracetamol A','qty',1,'unit_price',1.00)))$q$,
    tests.id('phA'), tests.id('custA'), tests.id('prodA')));
select tests.throws('new staff cannot invite anyone',
  $q$select public.invite_staff('another@test.local', 'X', 'staff')$q$);
select tests.throws('new staff cannot promote themselves through the RPC',
  format($q$select public.set_staff_role(%L, 'owner')$q$, tests.id('inviteeA')));
select tests.throws('new staff cannot suspend the owner',
  format($q$select public.suspend_staff(%L)$q$, tests.id('ownerA')));
reset role;

-- ---------------------------------------------------------------------------
-- 4. Suspension removes access immediately (same JWT, no re-login)
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner suspends the staff member',
  format($q$select public.suspend_staff(%L)$q$, tests.id('inviteeA')));
reset role;
select tests.is('suspension is recorded on the profile',
  format($q$select count(*) from public.users_profiles where id = %L and status = 'suspended'$q$, tests.id('inviteeA')), 1);
select tests.is('suspension is audited',
  format($q$select count(*) from public.staff_audit_log where action = 'user_suspended' and target_user_id = %L$q$, tests.id('inviteeA')), 1);

select tests.login('inviteeA');
set role authenticated;
select tests.is('suspended staff can no longer read customers', 'select count(*) from public.customers', 0);
select tests.is('suspended staff can no longer read inventory', 'select count(*) from public.inventory', 0);
select tests.throws('suspended staff cannot record a purchase',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, jsonb_build_array(jsonb_build_object('product_id', %L::text, 'name','x','qty',1,'unit_price',1)))$q$,
    tests.id('phA'), tests.id('custA'), tests.id('prodA')));
select tests.throws('suspended staff cannot adjust stock',
  format($q$select public.adjust_stock(%L, %L, 5, null)$q$, tests.id('phA'), tests.id('prodA')));
select tests.throws('suspended staff cannot create a customer',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name) values (%L, '+231999', 'X', 'Y')$q$, tests.id('phA')));
select tests.is('suspended staff can still see their own account status',
  $q$select (public.my_account_status() = 'suspended')::int::bigint$q$, 1);
reset role;

-- Reactivation restores access.
select tests.login('ownerA');
set role authenticated;
select tests.lives('owner reactivates the staff member',
  format($q$select public.reactivate_staff(%L)$q$, tests.id('inviteeA')));
reset role;
select tests.login('inviteeA');
set role authenticated;
select tests.is('reactivated staff can read customers again', 'select count(*) from public.customers', 3);
reset role;

-- ---------------------------------------------------------------------------
-- 5. Offboarding keeps history and removes access
-- ---------------------------------------------------------------------------
select tests.is('the offboarded person has recorded purchases before removal',
  format($q$select count(*) from public.purchases where staff_id = %L$q$, tests.id('inviteeA')), 1);

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner offboards the staff member',
  format($q$select public.remove_staff(%L)$q$, tests.id('inviteeA')));
reset role;

select tests.login('inviteeA');
set role authenticated;
select tests.is('offboarded staff cannot read protected data', 'select count(*) from public.customers', 0);
select tests.throws('offboarded staff cannot record a purchase',
  format($q$select public.record_purchase(%L, %L, 'Cash', null, '[{"name":"x","qty":1,"unit_price":1}]'::jsonb)$q$,
    tests.id('phA'), tests.id('custA')));
reset role;

select tests.is('historical purchases keep their attribution after offboarding',
  format($q$select count(*) from public.purchases where staff_id = %L$q$, tests.id('inviteeA')), 1);
select tests.is('historical stock movements keep their attribution',
  format($q$select count(*) from public.stock_movements where created_by = %L$q$, tests.id('inviteeA')), 1);
select tests.is('the profile row is preserved, not deleted',
  format($q$select count(*) from public.users_profiles where id = %L and status = 'removed'$q$, tests.id('inviteeA')), 1);
select tests.is('offboarding is audited',
  format($q$select count(*) from public.staff_audit_log where action = 'user_removed' and target_user_id = %L$q$, tests.id('inviteeA')), 1);

-- ---------------------------------------------------------------------------
-- 6. Role changes
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.throws('owner cannot promote anyone to platform admin',
  format($q$select public.set_staff_role(%L, 'admin')$q$, tests.id('staffA')));
select tests.lives('owner can promote their staff to owner',
  format($q$select public.set_staff_role(%L, 'owner')$q$, tests.id('staffA')));
select tests.lives('owner can demote back to staff',
  format($q$select public.set_staff_role(%L, 'staff')$q$, tests.id('staffA')));
select tests.throws('owner cannot change their own role',
  format($q$select public.set_staff_role(%L, 'staff')$q$, tests.id('ownerA')));
select tests.throws('owner cannot change a user in another pharmacy',
  format($q$select public.set_staff_role(%L, 'owner')$q$, tests.id('staffB')));
select tests.throws('owner cannot suspend a user in another pharmacy',
  format($q$select public.suspend_staff(%L)$q$, tests.id('staffB')));
select tests.throws('owner cannot manage a platform admin',
  format($q$select public.suspend_staff(%L)$q$, tests.id('admin')));
reset role;
select tests.is('role changes are audited with previous and new values',
  format($q$select count(*) from public.staff_audit_log
           where action = 'role_changed' and target_user_id = %L
             and previous_value ? 'role' and new_value ? 'role'$q$, tests.id('staffA')), 2);
select tests.is('staffB is untouched by pharmacy A''s owner',
  format($q$select count(*) from public.users_profiles where id = %L and role = 'staff' and status = 'active'$q$, tests.id('staffB')), 1);

-- ---------------------------------------------------------------------------
-- 7. Audit log integrity and visibility
-- ---------------------------------------------------------------------------
select tests.login('ownerA');
set role authenticated;
select tests.is('owner can read their pharmacy''s audit log',
  format($q$select (count(*) > 0)::int::bigint from public.staff_audit_log where pharmacy_id = %L$q$, tests.id('phA')), 1);
select tests.is('owner cannot read another pharmacy''s audit log',
  format($q$select count(*) from public.staff_audit_log where pharmacy_id = %L$q$, tests.id('phB')), 0);
select tests.throws('owner cannot rewrite history',
  $q$update public.staff_audit_log set action = 'tampered'$q$);
select tests.throws('owner cannot delete history',
  $q$delete from public.staff_audit_log$q$);
select tests.throws('owner cannot forge an audit entry',
  format($q$insert into public.staff_audit_log (pharmacy_id, action) values (%L, 'forged')$q$, tests.id('phA')));
reset role;

select tests.login('staffA');
set role authenticated;
select tests.is('ordinary staff cannot read the audit log', 'select count(*) from public.staff_audit_log', 0);
select tests.is('ordinary staff cannot read invitations', 'select count(*) from public.staff_invitations', 0);
reset role;

select tests.login(null);
set role anon;
select tests.sees_nothing('anon cannot read the audit log', 'select count(*) from public.staff_audit_log');
select tests.sees_nothing('anon cannot read invitations', 'select count(*) from public.staff_invitations');
select tests.throws('anon cannot call invite_staff', $q$select public.invite_staff('x@test.local', 'X', 'staff')$q$);
select tests.throws('anon cannot call accept_staff_invitation', $q$select public.accept_staff_invitation('abc')$q$);
select tests.throws('anon cannot call suspend_staff',
  format($q$select public.suspend_staff(%L)$q$, tests.id('staffA')));
reset role;

-- ---------------------------------------------------------------------------
-- 8. A pharmacy always keeps an owner
-- ---------------------------------------------------------------------------
select tests.login('ownerB');
set role authenticated;
select tests.lives('owner B promotes staff B to owner',
  format($q$select public.set_staff_role(%L, 'owner')$q$, tests.id('staffB')));
select tests.lives('with two owners, one may be offboarded',
  format($q$select public.remove_staff(%L)$q$, tests.id('staffB')));
reset role;
select tests.is('pharmacy B still has an active owner',
  format($q$select count(*) from public.users_profiles where pharmacy_id = %L and role = 'owner' and status = 'active'$q$,
    tests.id('phB')), 1);

-- ---------------------------------------------------------------------------
-- 9. Permissions matrix: destructive deletes and pharmacy settings
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.no_effect('staff cannot delete a customer',
  format($q$delete from public.customers where pharmacy_id = %L$q$, tests.id('phA')));
select tests.no_effect('staff cannot delete a product',
  format($q$delete from public.products where pharmacy_id = %L$q$, tests.id('phA')));
select tests.no_effect('staff cannot delete a supplier',
  format($q$delete from public.suppliers where pharmacy_id = %L$q$, tests.id('phA')));
select tests.no_effect('staff cannot rename the pharmacy',
  format($q$update public.pharmacies set name = 'Staff Renamed' where id = %L$q$, tests.id('phA')));
select tests.lives('staff can still create a customer (day-to-day work)',
  format($q$insert into public.customers (pharmacy_id, phone, first_name, last_name) values (%L, '+231555777', 'Day', 'Work')$q$, tests.id('phA')));
select tests.lives('staff can still update a customer',
  format($q$update public.customers set community = 'Sinkor' where pharmacy_id = %L and phone = '+231555777'$q$, tests.id('phA')));
reset role;

select tests.login('ownerA');
set role authenticated;
select tests.lives('owner can rename their own pharmacy',
  format($q$update public.pharmacies set name = 'Pharmacy A (renamed)' where id = %L$q$, tests.id('phA')));
select tests.no_effect('owner cannot rename another pharmacy',
  format($q$update public.pharmacies set name = 'Hijacked' where id = %L$q$, tests.id('phB')));
select tests.throws('owner cannot create a second pharmacy directly',
  $q$insert into public.pharmacies (name) values ('Sneaky Branch')$q$);
select tests.lives('owner can delete a customer',
  format($q$delete from public.customers where pharmacy_id = %L and phone = '+231555777'$q$, tests.id('phA')));
reset role;
select tests.is('pharmacy B keeps its name',
  format($q$select count(*) from public.pharmacies where id = %L and name = 'Pharmacy B'$q$, tests.id('phB')), 1);

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (phases 2-4)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'staff lifecycle tests failed: % of %', v_failed, v_total;
  end if;
end $$;
