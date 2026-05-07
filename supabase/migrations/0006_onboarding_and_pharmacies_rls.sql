-- Phase 6: Onboarding + pharmacies RLS

-- Enable RLS on pharmacies
alter table public.pharmacies enable row level security;

-- Authenticated users can select their pharmacy; admin can select all
drop policy if exists "pharmacies_select" on public.pharmacies;
create policy "pharmacies_select"
on public.pharmacies
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.users_profiles up
    where up.id = auth.uid()
      and up.pharmacy_id = pharmacies.id
  )
);

-- No direct insert/update/delete on pharmacies (done via onboarding RPC for now).
drop policy if exists "pharmacies_write" on public.pharmacies;

-- Onboarding RPC: create pharmacy + owner profile for auth.uid()
create or replace function public.onboard_new_pharmacy(
  p_pharmacy_name text,
  p_country text default null,
  p_city text default null,
  p_address text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_owner_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_pharmacy_id uuid;
begin
  if v_user is null then
    raise exception 'unauthenticated';
  end if;

  select pharmacy_id into v_existing
  from public.users_profiles
  where id = v_user;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.pharmacies (name, country, city, address, phone, whatsapp)
  values (p_pharmacy_name, p_country, p_city, p_address, p_phone, p_whatsapp)
  returning id into v_pharmacy_id;

  insert into public.users_profiles (id, pharmacy_id, role, name, email)
  values (v_user, v_pharmacy_id, 'owner', coalesce(p_owner_name, 'Owner'), null);

  return v_pharmacy_id;
end;
$$;

