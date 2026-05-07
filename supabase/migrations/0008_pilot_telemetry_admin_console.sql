-- Phase 7: pilot telemetry + admin console support

-- 1) Profile activity fields
alter table public.users_profiles
  add column if not exists last_login_at timestamptz,
  add column if not exists last_seen_at timestamptz;

create index if not exists users_profiles_last_seen_at_idx on public.users_profiles(last_seen_at desc);

-- 2) Events (usage analytics)
create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  user_id uuid not null references public.users_profiles(id) on delete cascade,
  event_name text not null,
  module text,
  path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_events_pharmacy_created_at_idx on public.app_events(pharmacy_id, created_at desc);
create index if not exists app_events_event_name_idx on public.app_events(event_name);

-- 3) Feedback
do $$ begin
  create type public.feedback_kind as enum ('issue','feature','rating');
exception when duplicate_object then null;
end $$;

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  user_id uuid not null references public.users_profiles(id) on delete set null,
  kind public.feedback_kind not null,
  rating int,
  title text,
  message text,
  page text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_feedback_pharmacy_created_at_idx on public.app_feedback(pharmacy_id, created_at desc);
create index if not exists app_feedback_kind_created_at_idx on public.app_feedback(kind, created_at desc);

-- 4) App logs (client-side errors)
create table if not exists public.app_logs (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  user_id uuid references public.users_profiles(id) on delete set null,
  level text not null default 'error',
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_logs_created_at_idx on public.app_logs(created_at desc);
create index if not exists app_logs_pharmacy_created_at_idx on public.app_logs(pharmacy_id, created_at desc);

-- 5) RLS policies
alter table public.app_events enable row level security;
alter table public.app_feedback enable row level security;
alter table public.app_logs enable row level security;

drop policy if exists "app_events_select" on public.app_events;
create policy "app_events_select"
on public.app_events
for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "app_events_insert" on public.app_events;
create policy "app_events_insert"
on public.app_events
for insert
to authenticated
with check (
  public.same_pharmacy(pharmacy_id)
  and user_id = auth.uid()
);

drop policy if exists "app_feedback_select" on public.app_feedback;
create policy "app_feedback_select"
on public.app_feedback
for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "app_feedback_insert" on public.app_feedback;
create policy "app_feedback_insert"
on public.app_feedback
for insert
to authenticated
with check (
  public.same_pharmacy(pharmacy_id)
  and user_id = auth.uid()
);

drop policy if exists "app_logs_select" on public.app_logs;
create policy "app_logs_select"
on public.app_logs
for select
to authenticated
using (public.is_admin() or (pharmacy_id is not null and public.same_pharmacy(pharmacy_id)));

drop policy if exists "app_logs_insert" on public.app_logs;
create policy "app_logs_insert"
on public.app_logs
for insert
to authenticated
with check (
  (pharmacy_id is null or public.same_pharmacy(pharmacy_id))
  and (user_id is null or user_id = auth.uid())
);

-- 6) Admin overview RPC (aggregated)
create or replace function public.admin_pilot_overview()
returns table (
  pharmacy_id uuid,
  pharmacy_name text,
  users_count int,
  last_seen_at timestamptz,
  last_purchase_at timestamptz,
  last_stock_movement_at timestamptz,
  errors_24h int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ph.id as pharmacy_id,
    ph.name as pharmacy_name,
    coalesce(u.cnt, 0)::int as users_count,
    u.last_seen_at,
    p.last_purchase_at,
    sm.last_stock_movement_at,
    coalesce(e.err_24h, 0)::int as errors_24h
  from public.pharmacies ph
  left join (
    select
      pharmacy_id,
      count(*) as cnt,
      max(last_seen_at) as last_seen_at
    from public.users_profiles
    group by pharmacy_id
  ) u on u.pharmacy_id = ph.id
  left join (
    select pharmacy_id, max(purchased_at) as last_purchase_at
    from public.purchases
    group by pharmacy_id
  ) p on p.pharmacy_id = ph.id
  left join (
    select pharmacy_id, max(occurred_at) as last_stock_movement_at
    from public.stock_movements
    group by pharmacy_id
  ) sm on sm.pharmacy_id = ph.id
  left join (
    select pharmacy_id, count(*) filter (where created_at > now() - interval '24 hours') as err_24h
    from public.app_logs
    group by pharmacy_id
  ) e on e.pharmacy_id = ph.id
  where public.is_admin()
  order by ph.created_at desc;
$$;

