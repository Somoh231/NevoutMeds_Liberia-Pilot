-- NevOut Meds — pilot operations: backup heartbeat + health summary.
--
-- Additive only. Nothing here is readable or callable by pharmacy users:
--   * private.backup_runs          — one row per backup attempt (database / storage)
--   * public.ops_record_backup_run — service_role only; called by ops/backup scripts
--   * public.ops_health            — platform admin or service_role; one JSON summary
--                                    with explicit "alerts" for the health-check job
-- Everything is derived from data the product already records (app_logs,
-- purchases, inventory, stock_movements) plus the backup heartbeat.

create table if not exists private.backup_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('database', 'storage')),
  status text not null check (status in ('success', 'failure')),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  artifact text,
  bytes bigint check (bytes is null or bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  destination text,
  host text,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) < 8192)
);
create index if not exists backup_runs_kind_finished_idx on private.backup_runs (kind, finished_at desc);
revoke all on private.backup_runs from public, anon, authenticated;

create or replace function public.ops_record_backup_run(p_run jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  if p_run is null or jsonb_typeof(p_run) <> 'object' then
    raise exception 'run must be a JSON object' using errcode = '22023';
  end if;
  insert into private.backup_runs (kind, status, started_at, finished_at, artifact, bytes, sha256, destination, host, detail)
  values (
    p_run->>'kind',
    p_run->>'status',
    coalesce((p_run->>'started_at')::timestamptz, now()),
    coalesce((p_run->>'finished_at')::timestamptz, now()),
    left(p_run->>'artifact', 300),
    (p_run->>'bytes')::bigint,
    lower(p_run->>'sha256'),
    left(p_run->>'destination', 300),
    left(p_run->>'host', 120),
    case when jsonb_typeof(p_run->'detail') = 'object' then p_run->'detail' else '{}'::jsonb end
  )
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.ops_record_backup_run(jsonb) from public, anon, authenticated;
grant execute on function public.ops_record_backup_run(jsonb) to service_role;

create or replace function public.ops_health(p_hours int default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hours int := least(greatest(coalesce(p_hours, 24), 1), 24 * 30);
  v_since timestamptz := now() - make_interval(hours => v_hours);
  v_backups jsonb;
  v_errors jsonb;
  v_sync jsonb;
  v_storage_failures bigint;
  v_integrity jsonb;
  v_activity jsonb;
  v_alerts text[] := '{}';
  v_db_age numeric;
  v_storage_objects bigint;
  v_storage_age numeric;
begin
  if not (private.is_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'forbidden: platform admin only' using errcode = '42501';
  end if;

  -- Backups: last success / failure per kind.
  select jsonb_object_agg(k.kind, jsonb_build_object(
           'last_success_at', s.finished_at,
           'age_hours', case when s.finished_at is null then null else round(extract(epoch from now() - s.finished_at) / 3600.0, 1) end,
           'last_success_bytes', s.bytes,
           'last_failure_at', f.finished_at,
           'failures_in_window', coalesce(fc.n, 0)))
    into v_backups
  from (values ('database'), ('storage')) k(kind)
  left join lateral (select r.finished_at, r.bytes from private.backup_runs r where r.kind = k.kind and r.status = 'success' order by r.finished_at desc limit 1) s on true
  left join lateral (select r.finished_at from private.backup_runs r where r.kind = k.kind and r.status = 'failure' order by r.finished_at desc limit 1) f on true
  left join lateral (select count(*) n from private.backup_runs r where r.kind = k.kind and r.status = 'failure' and r.finished_at >= v_since) fc on true;

  -- Application errors (crash boundary and other client errors), excluding sync bookkeeping.
  select jsonb_build_object(
           'total', coalesce(sum(n), 0),
           'top', coalesce(jsonb_agg(jsonb_build_object('message', message, 'count', n, 'pharmacies', ph) order by n desc) filter (where rn <= 10), '[]'::jsonb))
    into v_errors
  from (
    select l.message, count(*) n, count(distinct l.pharmacy_id) ph, row_number() over (order by count(*) desc) rn
    from public.app_logs l
    where l.created_at >= v_since and l.level = 'error' and l.message not like 'sync\_%' and l.message not like 'storage\_%'
    group by l.message
  ) e;

  -- Offline sync: conflicts ("Needs attention") and repeated failures reported by devices.
  select jsonb_build_object(
           'conflicts', count(*) filter (where l.message = 'sync_conflict'),
           'failures', count(*) filter (where l.message = 'sync_failed'),
           'pharmacies_affected', count(distinct l.pharmacy_id) filter (where l.message in ('sync_conflict', 'sync_failed')))
    into v_sync
  from public.app_logs l
  where l.created_at >= v_since and l.message like 'sync\_%';

  select count(*) into v_storage_failures
  from public.app_logs l
  where l.created_at >= v_since and l.message like 'storage\_%';

  -- Integrity invariants (must all be zero).
  select jsonb_build_object(
    'negative_stock', (select count(*) from public.inventory i where i.stock < 0),
    'duplicate_purchases', (select count(*) from (
        select 1 from public.purchases p
        group by p.pharmacy_id, p.customer_id, p.amount, p.purchased_at having count(*) > 1) d),
    'unstamped_sales', (select count(*) from public.purchases p where p.currency_code is null),
    'stock_movement_mismatch', (select count(*) from (
        select 1 from public.inventory i
        left join public.stock_movements m on m.product_id = i.product_id and m.pharmacy_id = i.pharmacy_id
        group by i.pharmacy_id, i.product_id, i.stock
        having i.stock <> coalesce(sum(m.delta), 0)) x)
  ) into v_integrity;

  -- Activity: pharmacies with nothing recorded recently (possible outage or abandonment).
  select jsonb_build_object(
    'pharmacies', (select count(*) from public.pharmacies),
    'silent_48h', coalesce((
      select jsonb_agg(ph.name order by ph.name)
      from public.pharmacies ph
      where not exists (select 1 from public.app_events e where e.pharmacy_id = ph.id and e.created_at >= now() - interval '48 hours')
        and not exists (select 1 from public.purchases p where p.pharmacy_id = ph.id and p.created_at >= now() - interval '48 hours')
    ), '[]'::jsonb)
  ) into v_activity;

  -- storage.objects exists on every Supabase project; tolerate databases without it.
  if to_regclass('storage.objects') is not null then
    execute 'select count(*) from storage.objects' into v_storage_objects;
  else
    v_storage_objects := 0;
  end if;

  -- Alerts: each one is actionable (see docs/MONITORING.md).
  v_db_age := (v_backups->'database'->>'age_hours')::numeric;
  v_storage_age := (v_backups->'storage'->>'age_hours')::numeric;
  if v_db_age is null then
    v_alerts := array_append(v_alerts, 'BACKUP: no successful database backup has ever been recorded');
  elsif v_db_age > 26 then
    v_alerts := array_append(v_alerts, format('BACKUP: last successful database backup is %s hours old', v_db_age));
  end if;
  if v_storage_objects > 0 and (v_storage_age is null or v_storage_age > 26) then
    v_alerts := array_append(v_alerts, format('BACKUP: %s storage object(s) and no storage backup in the last 26 hours', v_storage_objects));
  end if;
  if coalesce((v_backups->'database'->>'failures_in_window')::int, 0) + coalesce((v_backups->'storage'->>'failures_in_window')::int, 0) > 0 then
    v_alerts := array_append(v_alerts, 'BACKUP: a backup run failed in the window');
  end if;
  if (v_integrity->>'negative_stock')::int > 0 then v_alerts := array_append(v_alerts, 'INTEGRITY: negative stock'); end if;
  if (v_integrity->>'duplicate_purchases')::int > 0 then v_alerts := array_append(v_alerts, 'INTEGRITY: duplicate-looking purchases'); end if;
  if (v_integrity->>'unstamped_sales')::int > 0 then v_alerts := array_append(v_alerts, 'INTEGRITY: sales without a currency'); end if;
  if (v_integrity->>'stock_movement_mismatch')::int > 0 then v_alerts := array_append(v_alerts, 'INTEGRITY: stock differs from its movement history'); end if;
  if (v_errors->>'total')::int >= 5 then v_alerts := array_append(v_alerts, format('APP: %s client errors in %s h', v_errors->>'total', v_hours)); end if;
  if (v_sync->>'conflicts')::int > 0 then v_alerts := array_append(v_alerts, format('SYNC: %s change(s) need attention on a device', v_sync->>'conflicts')); end if;
  if (v_sync->>'failures')::int >= 3 then v_alerts := array_append(v_alerts, format('SYNC: %s repeated sync failures', v_sync->>'failures')); end if;
  if v_storage_failures > 0 then v_alerts := array_append(v_alerts, format('STORAGE: %s document upload/cleanup failure(s)', v_storage_failures)); end if;

  return jsonb_build_object(
    'generated_at', now(),
    'window_hours', v_hours,
    'backups', v_backups,
    'app_errors', v_errors,
    'sync', v_sync,
    'storage', jsonb_build_object('objects', v_storage_objects, 'failures_in_window', v_storage_failures),
    'integrity', v_integrity,
    'activity', v_activity,
    'alerts', to_jsonb(v_alerts)
  );
end $$;

revoke all on function public.ops_health(int) from public, anon;
grant execute on function public.ops_health(int) to authenticated, service_role;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
