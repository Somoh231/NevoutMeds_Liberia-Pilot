-- Phase 11: capability-based authorization and multi-factor assurance.
--
-- Additive and behaviour-preserving, with three deliberate tightenings:
--   * MFA assurance: an account whose policy requires MFA (owner, admin), or that has
--     enrolled a verified factor, gets NO tenant access until its session reaches
--     aal2. The gate sits in the private helpers that every RLS policy and RPC
--     already uses, so it covers PostgREST, RPCs, Storage and the staff-admin Edge
--     Function (which calls RPCs with the caller's own JWT).
--   * documents.read: documents (and their Storage objects) become owner-only,
--     matching the product decision (baseline finding F2).
--   * inventory.import: import_inventory_levels becomes owner-only (finding F1).
--
-- Roles are unchanged (owner, staff, admin). Roles map to capabilities in
-- private.role_capabilities; client/src/platform/auth/capabilities.ts mirrors the
-- same table and supabase/tests/capabilities_parity.test.mjs keeps them identical.
--
-- Rollback: roll forward. Restoring the pre-0020 behaviour means re-creating the
-- 0019 helper bodies (without private.mfa_satisfied()) and the policies below with
-- private.is_owner(); nothing here drops data.

-- ── 1. Capability registry ─────────────────────────────────────────────────
create table if not exists private.capabilities (
  capability  text primary key check (capability ~ '^[a-z_]+(\.[a-z_]+)+$'),
  area        text not null,
  description text not null
);

create table if not exists private.role_capabilities (
  role       public.user_role not null,
  capability text not null references private.capabilities(capability) on delete cascade,
  primary key (role, capability)
);

insert into private.capabilities (capability, area, description) values
  ('pharmacy.settings.read',   'pharmacy',        'See the pharmacy''s name, country, currency and payment methods'),
  ('pharmacy.settings.manage', 'pharmacy',        'Change pharmacy details, country configuration and payment methods'),
  ('staff.read',               'staff',           'See the team directory and staff sales performance'),
  ('staff.invite',             'staff',           'Invite, re-send and cancel staff invitations'),
  ('staff.manage',             'staff',           'Suspend, reactivate and offboard team members'),
  ('staff.role.manage',        'staff',           'Change a team member''s role'),
  ('staff.audit.read',         'staff',           'Read the team and security activity log'),
  ('sales.read',               'sales',           'See recorded sales'),
  ('sales.create',             'sales',           'Record a sale'),
  ('customers.read',           'customers',       'See customers and their credit'),
  ('customers.create',         'customers',       'Register a customer'),
  ('customers.update',         'customers',       'Edit a customer'),
  ('customers.delete',         'customers',       'Delete a customer record'),
  ('inventory.read',           'inventory',       'See products, stock, expiry and stock history'),
  ('inventory.adjust',         'inventory',       'Adjust stock (deliveries, damage, counts, write-offs)'),
  ('inventory.manage',         'inventory',       'Create and edit products'),
  ('inventory.delete',         'inventory',       'Delete a product'),
  ('inventory.import',         'inventory',       'Import stock levels from a spreadsheet'),
  ('suppliers.read',           'suppliers',       'See suppliers and recorded prices'),
  ('suppliers.manage',         'suppliers',       'Add and edit suppliers and prices'),
  ('suppliers.delete',         'suppliers',       'Delete suppliers and recorded prices'),
  ('purchase_orders.read',     'purchasing',      'See purchase orders'),
  ('purchase_orders.create',   'purchasing',      'Create a purchase order'),
  ('purchase_orders.update',   'purchasing',      'Update a purchase order and its items'),
  ('purchase_orders.delete',   'purchasing',      'Delete a purchase order'),
  ('reminders.manage',         'operations',      'Create, complete and delete refill reminders'),
  ('documents.read',           'documents',       'Open the pharmacy''s stored documents'),
  ('documents.manage',         'documents',       'Upload, edit and delete stored documents'),
  ('reports.read',             'insights',        'Open Reports'),
  ('analyst.read',             'insights',        'Open the Analyst'),
  ('financials.read',          'insights',        'See revenue, margin and the cash position'),
  ('platform.admin',           'platform',        'NevOut platform administration (admin console, cross-tenant health)')
on conflict (capability) do update set area = excluded.area, description = excluded.description;

-- Staff: the counter, all day. Owner: everything in the pharmacy. Admin: owner + platform.
with staff_caps(c) as (values
  ('pharmacy.settings.read'), ('sales.read'), ('sales.create'),
  ('customers.read'), ('customers.create'), ('customers.update'),
  ('inventory.read'), ('inventory.adjust'), ('inventory.manage'),
  ('suppliers.read'), ('suppliers.manage'),
  ('purchase_orders.read'), ('purchase_orders.create'), ('purchase_orders.update'),
  ('reminders.manage')
)
insert into private.role_capabilities (role, capability)
select 'staff'::public.user_role, c from staff_caps
on conflict do nothing;

insert into private.role_capabilities (role, capability)
select 'owner'::public.user_role, capability from private.capabilities where capability <> 'platform.admin'
on conflict do nothing;

insert into private.role_capabilities (role, capability)
select 'admin'::public.user_role, capability from private.capabilities
on conflict do nothing;

-- ── 2. MFA policy per role ─────────────────────────────────────────────────
-- Owners and platform admins must use a second factor. Staff may opt in; making it
-- mandatory for everyone later is: update private.mfa_policy set mfa_required = true;
create table if not exists private.mfa_policy (
  role         public.user_role primary key,
  mfa_required boolean not null
);
insert into private.mfa_policy (role, mfa_required) values
  ('owner', true), ('admin', true), ('staff', false)
on conflict (role) do nothing;

revoke all on private.capabilities, private.role_capabilities, private.mfa_policy from public, anon, authenticated;

-- ── 3. The assurance gate ──────────────────────────────────────────────────
-- True when the caller's session is strong enough for their account:
--   * aal2 always satisfies;
--   * aal1 satisfies only an account that neither requires MFA by policy nor has a
--     verified factor (Supabase's recommended "enforce once enrolled" rule).
-- Reads the aal claim Supabase Auth signs into the JWT; nothing client-writable.
-- Never reads auth.mfa_factors.secret.
create or replace function private.mfa_satisfied()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not (
        exists (select 1 from auth.mfa_factors f
                where f.user_id = auth.uid() and f.status = 'verified')
        or exists (select 1 from public.users_profiles up
                   join private.mfa_policy p on p.role = up.role
                   where up.id = auth.uid() and p.mfa_required)
      )
$$;

-- ── 4. Helpers: status-aware (0014) and now assurance-aware ────────────────
create or replace function private.current_profile()
returns table(user_id uuid, pharmacy_id uuid, role public.user_role)
language sql stable security definer
set search_path = ''
as $$
  select up.id, up.pharmacy_id, up.role from public.users_profiles up
  where up.id = auth.uid() and up.status = 'active' and private.mfa_satisfied()
$$;

create or replace function private.pharmacy_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select up.pharmacy_id from public.users_profiles up
  where up.id = auth.uid() and up.status = 'active' and private.mfa_satisfied()
$$;

create or replace function private.user_role()
returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select up.role from public.users_profiles up
  where up.id = auth.uid() and up.status = 'active' and private.mfa_satisfied()
$$;

create or replace function private.is_member_of(p_pharmacy_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_pharmacy_id is not null
     and exists (select 1 from public.users_profiles up
                 where up.id = auth.uid() and up.pharmacy_id = p_pharmacy_id and up.status = 'active')
     and private.mfa_satisfied()
$$;

-- The single authorization question: does the caller (active, sufficiently
-- authenticated) hold this capability through their role?
create or replace function private.has_capability(p_capability text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.current_profile() cp
    join private.role_capabilities rc on rc.role = cp.role
    where rc.capability = p_capability
  )
$$;

-- Kept for existing callers; now expressed through capabilities.
create or replace function private.is_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_capability('staff.manage')
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_capability('platform.admin')
$$;

-- ── 5. Security events (append-only; no secrets, no codes, no tokens) ──────
create table if not exists public.security_events (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  user_id     uuid not null,
  actor       text not null default 'self' check (actor in ('self', 'owner', 'operator', 'system')),
  event       text not null check (event in (
                'mfa_enrollment_started', 'mfa_factor_verified', 'mfa_factor_removed',
                'mfa_challenge_failed', 'mfa_required_not_enrolled', 'mfa_admin_reset')),
  factor_id   uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
-- Re-assert the allowed values (keeps a re-applied migration identical to a fresh one).
alter table public.security_events drop constraint if exists security_events_actor_check;
alter table public.security_events add constraint security_events_actor_check check (actor in ('self', 'owner', 'operator', 'system'));

create index if not exists security_events_pharmacy_idx on public.security_events(pharmacy_id, created_at desc);
create index if not exists security_events_user_idx on public.security_events(user_id, created_at desc);

alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;

drop policy if exists security_events_select on public.security_events;
create policy security_events_select on public.security_events for select to authenticated
using (
  user_id = auth.uid()
  or (select private.is_admin())
  or (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('staff.audit.read')))
);

-- Client-reported MFA milestones, validated against auth.mfa_factors so a caller
-- cannot record a state that does not exist. Rate-limited per user.
create or replace function public.record_security_event(p_event text, p_factor_id uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pharmacy uuid;
  v_status text;
  v_type text;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_event not in ('mfa_enrollment_started', 'mfa_factor_verified', 'mfa_factor_removed', 'mfa_challenge_failed') then
    raise exception 'unknown security event' using errcode = '22023';
  end if;
  if (select count(*) from public.security_events e
      where e.user_id = v_uid and e.created_at > now() - interval '1 hour') >= 30 then
    return; -- quietly drop a flood; Supabase Auth keeps its own audit trail
  end if;

  select f.status::text, f.factor_type::text into v_status, v_type
  from auth.mfa_factors f where f.id = p_factor_id and f.user_id = v_uid;

  if p_event = 'mfa_enrollment_started' and v_status is distinct from 'unverified' then
    raise exception 'no enrollment in progress for that factor' using errcode = '22023';
  elsif p_event = 'mfa_factor_verified' and v_status is distinct from 'verified' then
    raise exception 'that factor is not verified' using errcode = '22023';
  elsif p_event = 'mfa_factor_removed' and v_status is not null then
    raise exception 'that factor still exists' using errcode = '22023';
  end if;

  select up.pharmacy_id into v_pharmacy from public.users_profiles up where up.id = v_uid;
  insert into public.security_events (pharmacy_id, user_id, actor, event, factor_id, detail)
  values (v_pharmacy, v_uid, 'self', p_event, p_factor_id,
          case when v_type is not null then jsonb_build_object('factor_type', v_type) else '{}'::jsonb end);
end $$;

-- What the app needs to decide which door to show, from trusted server state.
-- Deliberately NOT gated by MFA: an owner at aal1 must learn that they need to
-- enroll or verify. It reveals only the caller's own posture.
create or replace function public.my_security_posture()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_status public.account_status;
  v_pharmacy uuid;
  v_required boolean := false;
  v_enrolled boolean := false;
  v_aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  v_ok boolean;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select up.role, up.status, up.pharmacy_id into v_role, v_status, v_pharmacy
  from public.users_profiles up where up.id = v_uid;
  select coalesce(p.mfa_required, false) into v_required from private.mfa_policy p where p.role = v_role;
  v_required := coalesce(v_required, false);
  v_enrolled := exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified');
  v_ok := private.mfa_satisfied();

  -- Record, at most daily, that a privileged account is still without a factor.
  if v_required and not v_enrolled and v_status = 'active'
     and not exists (select 1 from public.security_events e
                     where e.user_id = v_uid and e.event = 'mfa_required_not_enrolled'
                       and e.created_at > now() - interval '24 hours') then
    insert into public.security_events (pharmacy_id, user_id, actor, event)
    values (v_pharmacy, v_uid, 'system', 'mfa_required_not_enrolled');
  end if;

  return jsonb_build_object(
    'role', v_role,
    'status', v_status,
    'mfa_required', v_required,
    'mfa_enrolled', v_enrolled,
    'aal', v_aal,
    'mfa_satisfied', v_ok,
    'capabilities', coalesce((
      select jsonb_agg(rc.capability order by rc.capability)
      from private.role_capabilities rc
      where rc.role = v_role and v_status = 'active' and v_ok
    ), '[]'::jsonb)
  );
end $$;

-- An owner resets a team member's authenticator (lost phone). Authorised here,
-- as the caller, with the same rules as suspending someone (staff.manage, same
-- pharmacy, not yourself, never a platform admin) and at aal2 like every tenant
-- action. The staff-admin Edge Function then deletes the factors through the
-- Supabase Auth admin API; nothing else can.
create or replace function public.reset_member_mfa(p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare v_ctx record;
begin
  select * into v_ctx from private.assert_can_manage(p_user_id);
  insert into public.security_events (pharmacy_id, user_id, actor, event, detail)
  values (v_ctx.pharmacy_id, p_user_id, 'owner', 'mfa_admin_reset', jsonb_build_object('by', auth.uid()));
  perform private.audit_staff(v_ctx.pharmacy_id, auth.uid(), p_user_id, 'mfa_reset', null, null);
  return jsonb_build_object('user_id', p_user_id);
end $$;

revoke all on function public.reset_member_mfa(uuid) from public, anon;
grant execute on function public.reset_member_mfa(uuid) to authenticated;
revoke all on function public.record_security_event(text, uuid) from public, anon;
revoke all on function public.my_security_posture() from public, anon;
grant execute on function public.record_security_event(text, uuid) to authenticated;
grant execute on function public.my_security_posture() to authenticated;

-- ── 6. RPCs: role checks become capability checks ──────────────────────────
-- Generated from the live definitions; only the authorization lines change.

CREATE OR REPLACE FUNCTION public.invite_staff(p_email text, p_name text DEFAULT NULL::text, p_role user_role DEFAULT 'staff'::user_role, p_expires_in_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid;
  v_role public.user_role;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
  v_id uuid;
  v_days int := least(greatest(coalesce(p_expires_in_days, 7), 1), 30);
begin
  -- Tenant and role from the MFA-gated helper (Phase 11), never the client.
  select cp.pharmacy_id, cp.role into v_pharmacy, v_role from private.current_profile() cp;

  if v_pharmacy is null then
    raise exception 'unauthenticated or inactive account' using errcode = '42501';
  end if;
  if not private.has_capability('staff.invite') then
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
end $function$;

CREATE OR REPLACE FUNCTION public.resend_staff_invitation(p_invitation_id uuid, p_expires_in_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid; v_role public.user_role;
  v_inv public.staff_invitations;
  v_token text;
  v_days int := least(greatest(coalesce(p_expires_in_days, 7), 1), 30);
begin
  -- Tenant and role from the MFA-gated helper (Phase 11), never the client.
  select cp.pharmacy_id, cp.role into v_pharmacy, v_role from private.current_profile() cp;
  if v_pharmacy is null or not private.has_capability('staff.invite') then
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
end $function$;

CREATE OR REPLACE FUNCTION public.revoke_staff_invitation(p_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid; v_role public.user_role; v_inv public.staff_invitations;
begin
  -- Tenant and role from the MFA-gated helper (Phase 11), never the client.
  select cp.pharmacy_id, cp.role into v_pharmacy, v_role from private.current_profile() cp;
  if v_pharmacy is null or not private.has_capability('staff.invite') then
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
end $function$;

CREATE OR REPLACE FUNCTION private.assert_can_manage(p_target uuid)
 RETURNS TABLE(pharmacy_id uuid, target_role user_role, target_status account_status)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_pharmacy uuid; v_role public.user_role;
  v_target public.users_profiles;
begin
  -- Tenant and role from the MFA-gated helper (Phase 11), never the client.
  select cp.pharmacy_id, cp.role into v_pharmacy, v_role from private.current_profile() cp;
  if v_pharmacy is null or not private.has_capability('staff.manage') then
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
end $function$;

CREATE OR REPLACE FUNCTION public.set_staff_role(p_user_id uuid, p_role user_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ctx record;
begin
  if not private.has_capability('staff.role.manage') then
    raise exception 'only the pharmacy owner can change roles' using errcode = '42501';
  end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.financial_summary(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pharmacy uuid;
  v_role public.user_role;
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_tz text;
  v_currency text;
  v_today date;
  v_from timestamptz;
  v_day_start timestamptz;
  v_result jsonb;
begin
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  v_role := private.user_role();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not private.has_capability('financials.read') then
    raise exception 'forbidden: owner only' using errcode = '42501';
  end if;

  -- Business days follow the pharmacy's timezone (from its row, not the client).
  v_tz := private.pharmacy_timezone(v_pharmacy);
  v_currency := private.pharmacy_currency(v_pharmacy);
  v_today := (now() at time zone v_tz)::date;
  v_day_start := (v_today::timestamp at time zone v_tz);
  v_from := ((v_today - (v_days - 1))::timestamp at time zone v_tz);

  select jsonb_build_object(
    'window_days', v_days,
    'generated_at', now(),
    'timezone', v_tz,
    'business_date', to_char(v_today, 'YYYY-MM-DD'),
    'currency', v_currency,
    -- Every figure below is in `currency`. Sales recorded in any other
    -- currency are reported separately here and never added in.
    'other_currencies', coalesce((
      select jsonb_agg(jsonb_build_object('currency', o.currency_code, 'total', o.total, 'transactions', o.cnt) order by o.currency_code)
      from (select p.currency_code, sum(p.amount) total, count(*) cnt
            from public.purchases p
            where p.pharmacy_id = v_pharmacy and p.purchased_at >= v_from and p.currency_code <> v_currency
            group by p.currency_code) o), '[]'::jsonb),
    'revenue', jsonb_build_object(
      'total', coalesce((select sum(p.amount) from public.purchases p
                         where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from), 0),
      'today', coalesce((select sum(p.amount) from public.purchases p
                         where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_day_start), 0),
      'transactions', coalesce((select count(*) from public.purchases p
                                where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from), 0),
      'by_method', coalesce((
        select jsonb_agg(jsonb_build_object('method', m.method, 'total', m.total, 'count', m.cnt) order by m.total desc)
        from (select p.method, sum(p.amount) total, count(*) cnt
              from public.purchases p
              where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from
              group by p.method) m), '[]'::jsonb),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'total', coalesce(t.total, 0)) order by g.d)
        from generate_series(v_today - (v_days - 1), v_today, interval '1 day') g(d)
        left join (select (p.purchased_at at time zone v_tz)::date d, sum(p.amount) total
                   from public.purchases p
                   where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from
                   group by 1) t on t.d = g.d), '[]'::jsonb)
    ),
    -- Cost of goods sold, from the recorded line items and the product's unit cost.
    'cogs', jsonb_build_object(
      'total', coalesce((select sum(pi.qty * pr.unit_cost)
                         from public.purchase_items pi
                         join public.products pr on pr.id = pi.product_id
                         join public.purchases p on p.id = pi.purchase_id
                         where pi.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from), 0),
      'covered_line_items', coalesce((select count(*) from public.purchase_items pi
                                      join public.purchases p on p.id = pi.purchase_id
                                      where pi.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from
                                        and pi.product_id is not null), 0),
      'untracked_line_items', coalesce((select count(*) from public.purchase_items pi
                                        join public.purchases p on p.id = pi.purchase_id
                                        where pi.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from
                                          and pi.product_id is null), 0)
    ),
    'credit', jsonb_build_object(
      'outstanding', coalesce((select sum(c.credit_balance) from public.customers c
                               where c.pharmacy_id = v_pharmacy and c.credit_balance > 0), 0),
      'customers', coalesce((select count(*) from public.customers c
                             where c.pharmacy_id = v_pharmacy and c.credit_balance > 0), 0),
      'over_limit', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.first_name || ' ' || c.last_name,
                                            'balance', c.credit_balance, 'limit', c.credit_limit)
               order by c.credit_balance desc)
        from public.customers c
        where c.pharmacy_id = v_pharmacy and c.credit_limit > 0 and c.credit_balance > c.credit_limit), '[]'::jsonb)
    ),
    'inventory_value', jsonb_build_object(
      'at_cost', coalesce((select sum(i.stock * pr.unit_cost) from public.inventory i
                           join public.products pr on pr.id = i.product_id
                           where i.pharmacy_id = v_pharmacy), 0),
      'at_retail', coalesce((select sum(i.stock * pr.selling_price) from public.inventory i
                             join public.products pr on pr.id = i.product_id
                             where i.pharmacy_id = v_pharmacy), 0)
    ),
    -- Explicitly declared so the UI never invents these numbers.
    'not_tracked', jsonb_build_array('operating_expenses', 'cash_on_hand', 'supplier_debt', 'payroll')
  ) into v_result;

  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.staff_performance(p_days integer DEFAULT 7)
 RETURNS TABLE(user_id uuid, name text, role user_role, last_seen_at timestamp with time zone, sales_total numeric, transactions integer, avg_sale numeric, daily jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pharmacy uuid;
  v_role public.user_role;
  v_days int := least(greatest(coalesce(p_days, 7), 1), 365);
  v_tz text;
  v_currency text;
  v_today date;
  v_from timestamptz;
begin
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  v_role := private.user_role();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not private.has_capability('staff.read') then
    raise exception 'forbidden: owner only' using errcode = '42501';
  end if;

  v_tz := private.pharmacy_timezone(v_pharmacy);
  v_currency := private.pharmacy_currency(v_pharmacy);
  v_today := (now() at time zone v_tz)::date;
  v_from := ((v_today - (v_days - 1))::timestamp at time zone v_tz);

  return query
  with member as (
    select up.id, up.name, up.role, up.last_seen_at
    from public.users_profiles up
    where up.pharmacy_id = v_pharmacy
  ),
  sales as (
    -- Totals are in the operating currency; never summed across currencies.
    select p.staff_id, p.amount, (p.purchased_at at time zone v_tz)::date as d
    from public.purchases p
    where p.pharmacy_id = v_pharmacy
      and p.currency_code = v_currency
      and p.purchased_at >= v_from
  )
  select m.id, m.name, m.role, m.last_seen_at,
         coalesce(sum(s.amount), 0)::numeric,
         count(s.*)::int,
         case when count(s.*) > 0 then round(coalesce(sum(s.amount), 0) / count(s.*), 2) else 0 end,
         coalesce((
           select jsonb_agg(jsonb_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'total', coalesce(t.total, 0)) order by g.d)
           from generate_series(v_today - (v_days - 1), v_today, interval '1 day') g(d)
           left join (
             select s2.d, sum(s2.amount) total from sales s2 where s2.staff_id = m.id group by s2.d
           ) t on t.d = g.d
         ), '[]'::jsonb)
  from member m
  left join sales s on s.staff_id = m.id
  group by m.id, m.name, m.role, m.last_seen_at
  order by 5 desc, m.name;
end $function$;

CREATE OR REPLACE FUNCTION public.update_pharmacy_settings(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pharmacy uuid;
  v_key text;
  v_allowed text[] := array['name','city','address','phone','whatsapp','country_code','default_currency',
                            'timezone','locale','payment_methods','address_fields','regulatory'];
  v_methods text[];
  v_row public.pharmacies;
begin
  v_pharmacy := private.pharmacy_id();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not private.has_capability('pharmacy.settings.manage') then
    raise exception 'forbidden: owner only' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'changes must be a JSON object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'setting % cannot be changed here', v_key using errcode = '22023';
    end if;
  end loop;
  if p_changes ? 'name' and coalesce(trim(p_changes->>'name'), '') = '' then
    raise exception 'pharmacy name is required' using errcode = '22023';
  end if;
  if p_changes ? 'payment_methods' then
    if jsonb_typeof(p_changes->'payment_methods') = 'array' then
      select coalesce(array_agg(x), '{}') into v_methods from jsonb_array_elements_text(p_changes->'payment_methods') x;
    elsif jsonb_typeof(p_changes->'payment_methods') <> 'null' then
      raise exception 'payment_methods must be a list' using errcode = '22023';
    end if;
  end if;

  update public.pharmacies ph set
    name = case when p_changes ? 'name' then left(trim(p_changes->>'name'), 200) else ph.name end,
    city = case when p_changes ? 'city' then left(nullif(trim(p_changes->>'city'), ''), 200) else ph.city end,
    address = case when p_changes ? 'address' then left(nullif(trim(p_changes->>'address'), ''), 500) else ph.address end,
    phone = case when p_changes ? 'phone' then left(nullif(trim(p_changes->>'phone'), ''), 40) else ph.phone end,
    whatsapp = case when p_changes ? 'whatsapp' then left(nullif(trim(p_changes->>'whatsapp'), ''), 40) else ph.whatsapp end,
    country_code = case when p_changes ? 'country_code' then p_changes->>'country_code' else ph.country_code end,
    default_currency = case when p_changes ? 'default_currency' then p_changes->>'default_currency' else ph.default_currency end,
    timezone = case when p_changes ? 'timezone' then p_changes->>'timezone' else ph.timezone end,
    locale = case when p_changes ? 'locale' then p_changes->>'locale' else ph.locale end,
    payment_methods = case when p_changes ? 'payment_methods' then v_methods else ph.payment_methods end,
    address_fields = case when p_changes ? 'address_fields' then coalesce(p_changes->'address_fields', '{}'::jsonb) else ph.address_fields end,
    regulatory = case when p_changes ? 'regulatory' then coalesce(p_changes->'regulatory', '{}'::jsonb) else ph.regulatory end,
    updated_at = now()
  where ph.id = v_pharmacy
  returning * into v_row;

  return to_jsonb(v_row);
end $function$;

CREATE OR REPLACE FUNCTION public.import_inventory_levels(p_pharmacy_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pharmacy uuid;
  v_row jsonb;
  v_idx int := 0;
  v_applied int := 0;
  v_product_id uuid;
  v_stock int;
  v_current int;
  v_errors jsonb := '[]'::jsonb;
begin
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_pharmacy is distinct from p_pharmacy_id then
    raise exception 'forbidden: pharmacy mismatch' using errcode = '42501';
  end if;
  if not private.has_capability('inventory.import') then
    raise exception 'forbidden: only the pharmacy owner can import stock levels' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'rows must be a JSON array of at most 5000 entries';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_product_id := null;
    begin
      select pr.id into v_product_id
      from public.products pr
      where pr.pharmacy_id = p_pharmacy_id
        and lower(pr.name) = lower(trim(coalesce(v_row->>'product_name', '')));

      if v_product_id is null then
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'no product named ' || coalesce(v_row->>'product_name', ''));
        continue;
      end if;

      v_stock := coalesce((v_row->>'stock')::int, -1);
      if v_stock < 0 then
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'stock must be zero or more');
        continue;
      end if;

      insert into public.inventory (pharmacy_id, product_id, stock, batch_id, expiry_date)
      values (p_pharmacy_id, v_product_id, 0, nullif(v_row->>'batch_id', ''), nullif(v_row->>'expiry_date', '')::date)
      on conflict (pharmacy_id, product_id) do nothing;

      select inv.stock into v_current
      from public.inventory inv
      where inv.pharmacy_id = p_pharmacy_id and inv.product_id = v_product_id
      for update;

      update public.inventory
         set stock = v_stock,
             batch_id = coalesce(nullif(v_row->>'batch_id', ''), batch_id),
             expiry_date = coalesce(nullif(v_row->>'expiry_date', '')::date, expiry_date),
             updated_at = now()
       where pharmacy_id = p_pharmacy_id and product_id = v_product_id;

      -- Every stock change stays auditable, even during an import.
      if v_stock <> coalesce(v_current, 0) then
        insert into public.stock_movements (pharmacy_id, product_id, delta, note, occurred_at, created_by)
        values (p_pharmacy_id, v_product_id, v_stock - coalesce(v_current, 0), 'stock import', now(), auth.uid());
      end if;

      v_applied := v_applied + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('applied', v_applied, 'failed', jsonb_array_length(v_errors), 'errors', v_errors);
end $function$;

-- ── 7. RLS: owner-gated policies name the capability they protect ─────────
-- Same tenant predicate as before; only the role test becomes a capability.
do $$
declare r record;
begin
  for r in select * from (values
    ('customers',          'customers.delete'),
    ('products',           'inventory.delete'),
    ('suppliers',          'suppliers.delete'),
    ('supplier_catalogue', 'suppliers.delete'),
    ('purchase_orders',    'purchase_orders.delete')
  ) as t(tbl, cap)
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete', r.tbl);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability(%L)))
    $f$, r.tbl || '_delete', r.tbl, r.cap);
  end loop;
end $$;

-- Documents: reading is owner-only too (finding F2: staff contracts live here).
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
using ((select private.is_admin())
       or (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('documents.read'))));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
with check (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('documents.manage'))
            and (uploaded_by is null or uploaded_by = auth.uid()));

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
using (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('documents.manage')))
with check (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('documents.manage')));

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
using (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('documents.manage')));

-- Storage objects (skipped where the storage schema is absent, as in 0013).
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent: skipping document object policies';
    return;
  end if;
  execute $p$drop policy if exists documents_objects_select on storage.objects$p$;
  execute $p$create policy documents_objects_select on storage.objects for select to authenticated
using (bucket_id = 'documents'
       and (storage.foldername(name))[1] = ((select private.pharmacy_id()))::text
       and (select private.has_capability('documents.read')))$p$;
  execute $p$drop policy if exists documents_objects_insert on storage.objects$p$;
  execute $p$create policy documents_objects_insert on storage.objects for insert to authenticated
with check (bucket_id = 'documents'
            and (storage.foldername(name))[1] = ((select private.pharmacy_id()))::text
            and (select private.has_capability('documents.manage')))$p$;
  execute $p$drop policy if exists documents_objects_update on storage.objects$p$;
  execute $p$create policy documents_objects_update on storage.objects for update to authenticated
using (bucket_id = 'documents'
       and (storage.foldername(name))[1] = ((select private.pharmacy_id()))::text
       and (select private.has_capability('documents.manage')))
with check (bucket_id = 'documents'
            and (storage.foldername(name))[1] = ((select private.pharmacy_id()))::text
            and (select private.has_capability('documents.manage')))$p$;
  execute $p$drop policy if exists documents_objects_delete on storage.objects$p$;
  execute $p$create policy documents_objects_delete on storage.objects for delete to authenticated
using (bucket_id = 'documents'
       and (storage.foldername(name))[1] = ((select private.pharmacy_id()))::text
       and (select private.has_capability('documents.manage')))$p$;
end $$;

-- Staff administration and the audit trail.
drop policy if exists staff_audit_log_select on public.staff_audit_log;
create policy staff_audit_log_select on public.staff_audit_log for select to authenticated
using ((select private.is_admin())
       or (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('staff.audit.read'))));

drop policy if exists staff_invitations_select on public.staff_invitations;
create policy staff_invitations_select on public.staff_invitations for select to authenticated
using ((select private.is_admin())
       or (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('staff.invite'))));

drop policy if exists users_profiles_select on public.users_profiles;
create policy users_profiles_select on public.users_profiles for select to authenticated
using (id = auth.uid()
       or (select private.is_admin())
       or (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('staff.read'))));

-- Pharmacy settings.
drop policy if exists pharmacies_update on public.pharmacies;
create policy pharmacies_update on public.pharmacies for update to authenticated
using (id = (select private.pharmacy_id()) and (select private.has_capability('pharmacy.settings.manage')))
with check (id = (select private.pharmacy_id()) and (select private.has_capability('pharmacy.settings.manage')));

drop policy if exists pharmacy_config_changes_select on public.pharmacy_config_changes;
create policy pharmacy_config_changes_select on public.pharmacy_config_changes for select to authenticated
using ((select private.is_admin())
       or (pharmacy_id = (select private.pharmacy_id()) and (select private.has_capability('pharmacy.settings.manage'))));

-- ── 8. Privileges ──────────────────────────────────────────────────────────
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;
