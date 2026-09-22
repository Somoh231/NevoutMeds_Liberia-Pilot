-- Phase 4 — Staff lifecycle, suspension and audit.
--
-- Role model (deliberately small):
--   admin  = platform admin (NevOut staff). Cross-tenant READ only. Never
--            creatable or grantable by a pharmacy owner.
--   owner  = pharmacy owner. Manages their own pharmacy's staff.
--   staff  = day-to-day pharmacy user.
--
-- Account status is the single enforcement point: every private helper returns
-- "no tenant" unless the caller's profile is active, so suspending or removing
-- somebody immediately removes their access to every table and RPC, even if
-- their browser still holds a valid JWT.

-- ===========================================================================
-- 1. Account status
-- ===========================================================================
do $$ begin
  create type public.account_status as enum ('active', 'suspended', 'removed');
exception when duplicate_object then null;
end $$;

alter table public.users_profiles
  add column if not exists status public.account_status not null default 'active',
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.users_profiles(id) on delete set null;

create index if not exists users_profiles_status_idx on public.users_profiles(pharmacy_id, status);

-- Status is not writable through the API (defence in depth alongside the
-- existing column grants and the role/tenant trigger guard).
revoke update (status, status_changed_at, status_changed_by, joined_at) on public.users_profiles from authenticated;

-- ===========================================================================
-- 2. Helpers become status-aware (the suspension kill-switch)
-- ===========================================================================
create or replace function private.pharmacy_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select up.pharmacy_id from public.users_profiles up
  where up.id = auth.uid() and up.status = 'active'
$$;

create or replace function private.user_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select up.role from public.users_profiles up
  where up.id = auth.uid() and up.status = 'active'
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users_profiles up
                 where up.id = auth.uid() and up.role = 'admin' and up.status = 'active')
$$;

create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users_profiles up
                 where up.id = auth.uid() and up.role in ('owner','admin') and up.status = 'active')
$$;

create or replace function private.is_member_of(p_pharmacy_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_pharmacy_id is not null
     and exists (select 1 from public.users_profiles up
                 where up.id = auth.uid() and up.pharmacy_id = p_pharmacy_id and up.status = 'active')
$$;

create or replace function private.current_profile()
returns table (user_id uuid, pharmacy_id uuid, role public.user_role)
language sql stable security definer set search_path = '' as $$
  select up.id, up.pharmacy_id, up.role from public.users_profiles up
  where up.id = auth.uid() and up.status = 'active'
$$;

-- Readable by the caller even while suspended, so the app can explain why.
create or replace function public.my_account_status()
returns text language sql stable security definer set search_path = '' as $$
  select up.status::text from public.users_profiles up where up.id = auth.uid()
$$;

-- ===========================================================================
-- 3. Audit log (append-only for clients)
-- ===========================================================================
create table if not exists public.staff_audit_log (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  actor_user_id uuid references public.users_profiles(id) on delete set null,
  actor_email text,
  target_user_id uuid references public.users_profiles(id) on delete set null,
  target_email text,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_audit_log_pharmacy_idx on public.staff_audit_log(pharmacy_id, created_at desc);

alter table public.staff_audit_log enable row level security;

drop policy if exists staff_audit_log_select on public.staff_audit_log;
create policy staff_audit_log_select on public.staff_audit_log for select to authenticated
using ((select private.is_admin()) or (pharmacy_id = (select private.pharmacy_id()) and (select private.is_owner())));

-- No client may write or rewrite history; only SECURITY DEFINER flows can.
revoke insert, update, delete on public.staff_audit_log from authenticated;
revoke all on public.staff_audit_log from anon;

create or replace function private.audit_staff(
  p_pharmacy_id uuid, p_actor uuid, p_target uuid, p_action text,
  p_previous jsonb default null, p_new jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.staff_audit_log (pharmacy_id, actor_user_id, actor_email, target_user_id, target_email, action, previous_value, new_value)
  values (
    p_pharmacy_id, p_actor,
    (select u.email from auth.users u where u.id = p_actor),
    p_target,
    (select u.email from auth.users u where u.id = p_target),
    p_action, p_previous, p_new
  );
end $$;

-- ===========================================================================
-- 4. Invitations
-- ===========================================================================
create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  email text not null,
  name text,
  role public.user_role not null,
  -- Only the SHA-256 hash is stored; the token itself is shown once, to the
  -- inviting owner, and is never recoverable from the database.
  token_hash text not null unique,
  invited_by uuid references public.users_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.users_profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.users_profiles(id) on delete set null,
  constraint staff_invitations_role_not_admin check (role <> 'admin'),
  constraint staff_invitations_email_lower check (email = lower(email))
);

create index if not exists staff_invitations_pharmacy_idx on public.staff_invitations(pharmacy_id, created_at desc);
create index if not exists staff_invitations_email_idx on public.staff_invitations(lower(email));
-- One live invitation per email per pharmacy.
create unique index if not exists staff_invitations_pending_unique
  on public.staff_invitations (pharmacy_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.staff_invitations enable row level security;

drop policy if exists staff_invitations_select on public.staff_invitations;
create policy staff_invitations_select on public.staff_invitations for select to authenticated
using ((select private.is_admin()) or (pharmacy_id = (select private.pharmacy_id()) and (select private.is_owner())));

-- Invitations are only ever written by the SECURITY DEFINER flows below.
revoke insert, update, delete on public.staff_invitations from authenticated;
revoke all on public.staff_invitations from anon;

create or replace function public.invitation_status(p_row public.staff_invitations)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_row.revoked_at is not null then 'revoked'
    when p_row.accepted_at is not null then 'accepted'
    when p_row.expires_at <= now() then 'expired'
    else 'pending'
  end
$$;

-- ===========================================================================
-- 5. Owner-driven invitation lifecycle
-- ===========================================================================
create or replace function public.invite_staff(
  p_email text,
  p_name text default null,
  p_role public.user_role default 'staff',
  p_expires_in_days int default 7
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid;
  v_role public.user_role;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
  v_id uuid;
  v_days int := least(greatest(coalesce(p_expires_in_days, 7), 1), 30);
begin
  select up.pharmacy_id, up.role into v_pharmacy, v_role
  from public.users_profiles up where up.id = v_actor and up.status = 'active';

  if v_pharmacy is null then
    raise exception 'unauthenticated or inactive account' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'only the pharmacy owner can invite staff' using errcode = '42501';
  end if;
  -- An owner can never mint a platform admin.
  if p_role is null or p_role = 'admin' then
    raise exception 'invalid role for an invitation' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'a valid email address is required';
  end if;
  if exists (select 1 from public.users_profiles up
             join auth.users u on u.id = up.id
             where lower(u.email) = v_email and up.pharmacy_id = v_pharmacy and up.status <> 'removed') then
    raise exception 'that person is already on your team';
  end if;

  -- Replace any superseded invitation for the same address.
  update public.staff_invitations
     set revoked_at = now(), revoked_by = v_actor
   where pharmacy_id = v_pharmacy and email = v_email
     and accepted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.staff_invitations (pharmacy_id, email, name, role, token_hash, invited_by, expires_at)
  values (v_pharmacy, v_email, nullif(trim(p_name), ''), p_role,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), v_actor,
          now() + make_interval(days => v_days))
  returning id into v_id;

  perform private.audit_staff(v_pharmacy, v_actor, null, 'invitation_created', null,
    jsonb_build_object('invitation_id', v_id, 'email', v_email, 'role', p_role, 'expires_in_days', v_days));

  -- The plaintext token is returned exactly once.
  return jsonb_build_object('invitation_id', v_id, 'token', v_token, 'email', v_email,
                            'role', p_role, 'expires_at', now() + make_interval(days => v_days));
end $$;

create or replace function public.resend_staff_invitation(p_invitation_id uuid, p_expires_in_days int default 7)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid; v_role public.user_role;
  v_inv public.staff_invitations;
  v_token text;
  v_days int := least(greatest(coalesce(p_expires_in_days, 7), 1), 30);
begin
  select up.pharmacy_id, up.role into v_pharmacy, v_role
  from public.users_profiles up where up.id = v_actor and up.status = 'active';
  if v_pharmacy is null or v_role not in ('owner','admin') then
    raise exception 'only the pharmacy owner can resend invitations' using errcode = '42501';
  end if;

  select * into v_inv from public.staff_invitations
  where id = p_invitation_id and pharmacy_id = v_pharmacy;
  if v_inv.id is null then
    raise exception 'invitation not found' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'that invitation has already been accepted';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.staff_invitations
     set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         expires_at = now() + make_interval(days => v_days),
         revoked_at = null, revoked_by = null
   where id = p_invitation_id;

  perform private.audit_staff(v_pharmacy, v_actor, null, 'invitation_resent', null,
    jsonb_build_object('invitation_id', p_invitation_id, 'email', v_inv.email));

  return jsonb_build_object('invitation_id', p_invitation_id, 'token', v_token, 'email', v_inv.email,
                            'expires_at', now() + make_interval(days => v_days));
end $$;

create or replace function public.revoke_staff_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid; v_role public.user_role; v_inv public.staff_invitations;
begin
  select up.pharmacy_id, up.role into v_pharmacy, v_role
  from public.users_profiles up where up.id = v_actor and up.status = 'active';
  if v_pharmacy is null or v_role not in ('owner','admin') then
    raise exception 'only the pharmacy owner can revoke invitations' using errcode = '42501';
  end if;

  select * into v_inv from public.staff_invitations where id = p_invitation_id and pharmacy_id = v_pharmacy;
  if v_inv.id is null then
    raise exception 'invitation not found' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'that invitation has already been accepted';
  end if;

  update public.staff_invitations set revoked_at = now(), revoked_by = v_actor where id = p_invitation_id;
  perform private.audit_staff(v_pharmacy, v_actor, null, 'invitation_revoked', null,
    jsonb_build_object('invitation_id', p_invitation_id, 'email', v_inv.email));
end $$;

-- ===========================================================================
-- 6. Acceptance — the only way a staff profile is ever created
-- ===========================================================================
create or replace function public.accept_staff_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.staff_invitations;
  v_existing public.users_profiles;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if coalesce(trim(p_token), '') = '' or length(p_token) > 200 then
    raise exception 'invalid invitation link' using errcode = '42501';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  -- Look the invitation up by hash: the plaintext token is never stored.
  select * into v_inv from public.staff_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if v_inv.id is null then
    raise exception 'invalid invitation link' using errcode = '42501';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'this invitation was revoked' using errcode = '42501';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'this invitation has already been used' using errcode = '42501';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'this invitation has expired' using errcode = '42501';
  end if;
  if v_email is distinct from v_inv.email then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;

  select * into v_existing from public.users_profiles where id = v_uid;
  if v_existing.id is not null then
    raise exception 'this account already belongs to a pharmacy' using errcode = '42501';
  end if;

  -- pharmacy_id and role come from the invitation, never from the client.
  insert into public.users_profiles (id, pharmacy_id, role, name, email, status, joined_at)
  values (v_uid, v_inv.pharmacy_id, v_inv.role,
          left(coalesce(nullif(trim(v_inv.name), ''), split_part(v_email, '@', 1)), 200),
          v_email, 'active', now());

  update public.staff_invitations
     set accepted_at = now(), accepted_by = v_uid
   where id = v_inv.id and accepted_at is null;

  if not found then
    raise exception 'this invitation has already been used' using errcode = '42501';
  end if;

  perform private.audit_staff(v_inv.pharmacy_id, v_uid, v_uid, 'invitation_accepted', null,
    jsonb_build_object('invitation_id', v_inv.id, 'role', v_inv.role, 'email', v_email));

  return jsonb_build_object('pharmacy_id', v_inv.pharmacy_id, 'role', v_inv.role);
end $$;

-- ===========================================================================
-- 7. Suspension, reactivation, offboarding, role changes
-- ===========================================================================
create or replace function private.assert_can_manage(p_target uuid)
returns table (pharmacy_id uuid, target_role public.user_role, target_status public.account_status)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid; v_role public.user_role;
  v_target public.users_profiles;
begin
  select up.pharmacy_id, up.role into v_pharmacy, v_role
  from public.users_profiles up where up.id = v_actor and up.status = 'active';
  if v_pharmacy is null or v_role not in ('owner','admin') then
    raise exception 'only the pharmacy owner can manage staff' using errcode = '42501';
  end if;
  if p_target = v_actor then
    raise exception 'you cannot change your own account' using errcode = '42501';
  end if;

  select * into v_target from public.users_profiles where id = p_target;
  if v_target.id is null or v_target.pharmacy_id is distinct from v_pharmacy then
    raise exception 'that person is not in your pharmacy' using errcode = '42501';
  end if;
  if v_target.role = 'admin' then
    raise exception 'platform administrators cannot be managed here' using errcode = '42501';
  end if;

  pharmacy_id := v_pharmacy; target_role := v_target.role; target_status := v_target.status;
  return next;
end $$;

create or replace function public.suspend_staff(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ctx record;
begin
  select * into v_ctx from private.assert_can_manage(p_user_id);
  update public.users_profiles
     set status = 'suspended', status_changed_at = now(), status_changed_by = auth.uid(), updated_at = now()
   where id = p_user_id;
  perform private.audit_staff(v_ctx.pharmacy_id, auth.uid(), p_user_id, 'user_suspended',
    jsonb_build_object('status', v_ctx.target_status), jsonb_build_object('status', 'suspended'));
end $$;

create or replace function public.reactivate_staff(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ctx record;
begin
  select * into v_ctx from private.assert_can_manage(p_user_id);
  if v_ctx.target_status = 'removed' then
    raise exception 'offboarded accounts cannot be reactivated; invite the person again';
  end if;
  update public.users_profiles
     set status = 'active', status_changed_at = now(), status_changed_by = auth.uid(), updated_at = now()
   where id = p_user_id;
  perform private.audit_staff(v_ctx.pharmacy_id, auth.uid(), p_user_id, 'user_reactivated',
    jsonb_build_object('status', v_ctx.target_status), jsonb_build_object('status', 'active'));
end $$;

-- Offboarding keeps the row: purchases, stock movements and documents must
-- retain their attribution.
create or replace function public.remove_staff(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ctx record;
begin
  select * into v_ctx from private.assert_can_manage(p_user_id);
  if v_ctx.target_role = 'owner'
     and (select count(*) from public.users_profiles up
          where up.pharmacy_id = v_ctx.pharmacy_id and up.role = 'owner' and up.status = 'active') <= 1 then
    raise exception 'a pharmacy must keep at least one active owner';
  end if;
  update public.users_profiles
     set status = 'removed', status_changed_at = now(), status_changed_by = auth.uid(), updated_at = now()
   where id = p_user_id;
  perform private.audit_staff(v_ctx.pharmacy_id, auth.uid(), p_user_id, 'user_removed',
    jsonb_build_object('status', v_ctx.target_status), jsonb_build_object('status', 'removed'));
end $$;

create or replace function public.set_staff_role(p_user_id uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ctx record;
begin
  if p_role is null or p_role = 'admin' then
    raise exception 'a pharmacy owner cannot grant platform administrator' using errcode = '42501';
  end if;
  select * into v_ctx from private.assert_can_manage(p_user_id);
  if v_ctx.target_role = 'owner' and p_role <> 'owner'
     and (select count(*) from public.users_profiles up
          where up.pharmacy_id = v_ctx.pharmacy_id and up.role = 'owner' and up.status = 'active') <= 1 then
    raise exception 'a pharmacy must keep at least one active owner';
  end if;
  update public.users_profiles set role = p_role, updated_at = now() where id = p_user_id;
  perform private.audit_staff(v_ctx.pharmacy_id, auth.uid(), p_user_id, 'role_changed',
    jsonb_build_object('role', v_ctx.target_role), jsonb_build_object('role', p_role));
end $$;

-- ===========================================================================
-- 8. Privileges
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('invite_staff','resend_staff_invitation','revoke_staff_invitation',
                        'accept_staff_invitation','suspend_staff','reactivate_staff','remove_staff',
                        'set_staff_role','my_account_status','invitation_status')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
