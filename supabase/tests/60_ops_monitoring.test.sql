-- NevOut Meds — pilot operations: backup heartbeat and health summary (0019).
-- Reuses the tests.* scaffolding and fixtures from the earlier suites.

set client_min_messages = notice;

-- The service role runs some checks below; let it use the test scaffolding.
grant usage on schema tests to service_role;
grant select on tests.ids to service_role;
grant insert, select on tests.results to service_role;
grant usage on sequence tests.results_n_seq to service_role;

-- Service-role requests carry role=service_role in the JWT claims.
create or replace function tests.login_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Who may read the health summary and record backups
-- ---------------------------------------------------------------------------
select tests.login(null);
set role anon;
select tests.throws('anon cannot read ops health', 'select public.ops_health(24)');
select tests.throws('anon cannot record a backup run', $q$select public.ops_record_backup_run('{"kind":"database","status":"success"}')$q$);
reset role;

select tests.login('ownerA');
set role authenticated;
select tests.throws('a pharmacy owner cannot read platform ops health', 'select public.ops_health(24)');
select tests.throws('a pharmacy owner cannot record a backup run', $q$select public.ops_record_backup_run('{"kind":"database","status":"success"}')$q$);
select tests.throws('the backup log is not readable by users', 'select count(*) from private.backup_runs');
reset role;

select tests.login('staffA');
set role authenticated;
select tests.throws('staff cannot read platform ops health', 'select public.ops_health(24)');
reset role;

select tests.login('admin');
set role authenticated;
select tests.lives('the platform admin can read ops health', 'select public.ops_health(24)');
select tests.is('ops health says when no database backup was ever recorded',
  $q$select count(*) from jsonb_array_elements_text(public.ops_health(24)->'alerts') a where a like 'BACKUP: no successful database backup%'$q$, 1);
select tests.throws('even the admin cannot record backup runs (service role only)', $q$select public.ops_record_backup_run('{"kind":"database","status":"success"}')$q$);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Backup heartbeat drives the backup alerts
-- ---------------------------------------------------------------------------
select tests.login_service();
set role service_role;
select tests.lives('the service role records a successful database backup',
  $q$select public.ops_record_backup_run(jsonb_build_object('kind','database','status','success','started_at', now() - interval '2 minutes',
      'artifact','nevoutmeds-db-test-20260923T000000Z.tar.zst.enc','bytes', 12345,
      'sha256', repeat('a', 64),'destination','local','host','ci'))$q$);
select tests.throws('an unknown backup kind is rejected',
  $q$select public.ops_record_backup_run('{"kind":"everything","status":"success"}')$q$);
select tests.throws('a malformed checksum is rejected',
  $q$select public.ops_record_backup_run('{"kind":"database","status":"success","sha256":"not-a-hash"}')$q$);
select tests.is('after a fresh success the "no database backup" alert is gone',
  $q$select count(*) from jsonb_array_elements_text(public.ops_health(24)->'alerts') a where a like 'BACKUP: %database backup%'$q$, 0);
select tests.is('the summary reports the last database backup size',
  $q$select (public.ops_health(24)->'backups'->'database'->>'last_success_bytes')::bigint$q$, 12345);
select tests.lives('the service role records a failed storage backup',
  $q$select public.ops_record_backup_run('{"kind":"storage","status":"failure","detail":{"error":"destination unreachable"}}')$q$);
select tests.is('a failed run in the window raises a backup alert',
  $q$select count(*) from jsonb_array_elements_text(public.ops_health(24)->'alerts') a where a = 'BACKUP: a backup run failed in the window'$q$, 1);
select tests.lives('an old successful backup can be recorded',
  $q$select public.ops_record_backup_run(jsonb_build_object('kind','database','status','success','started_at', now() - interval '3 days','finished_at', now() - interval '3 days'))$q$);
reset role;

-- The newest success wins: an older run never hides a recent one.
select tests.login('admin');
set role authenticated;
select tests.is('the newest successful backup is the one reported',
  $q$select case when (public.ops_health(24)->'backups'->'database'->>'age_hours')::numeric < 1 then 1 else 0 end$q$, 1);
reset role;

-- ---------------------------------------------------------------------------
-- 3. Device-reported sync problems and integrity invariants
-- ---------------------------------------------------------------------------
select tests.login('staffA');
set role authenticated;
select tests.lives('a device can report a sync conflict for its own pharmacy',
  format($q$insert into public.app_logs (pharmacy_id, user_id, level, message, context)
            values (%L, %L, 'warn', 'sync_conflict', '{"mutation_type":"record_purchase","code":"PT409"}')$q$, tests.id('phA'), tests.id('staffA')));
select tests.throws('a device cannot report into another pharmacy',
  format($q$insert into public.app_logs (pharmacy_id, user_id, level, message) values (%L, %L, 'warn', 'sync_conflict')$q$, tests.id('phB'), tests.id('staffA')));
reset role;

select tests.login('admin');
set role authenticated;
select tests.is('ops health counts the sync conflict', $q$select (public.ops_health(24)->'sync'->>'conflicts')::int$q$, 1);
select tests.is('a sync conflict raises an actionable alert',
  $q$select count(*) from jsonb_array_elements_text(public.ops_health(24)->'alerts') a where a like 'SYNC: % need attention%'$q$, 1);
select tests.is('sync bookkeeping is not counted as an app crash',
  $q$select count(*) from jsonb_array_elements(public.ops_health(24)->'app_errors'->'top') t where t->>'message' like 'sync\_%'$q$, 0);
select tests.is('no negative stock exists', $q$select (public.ops_health(24)->'integrity'->>'negative_stock')::int$q$, 0);
select tests.is('no duplicate purchases exist', $q$select (public.ops_health(24)->'integrity'->>'duplicate_purchases')::int$q$, 0);
select tests.is('every sale carries a currency', $q$select (public.ops_health(24)->'integrity'->>'unstamped_sales')::int$q$, 0);
select tests.lives('the summary covers activity and storage', $q$select public.ops_health(24)->'activity'->'silent_48h', public.ops_health(24)->'storage'$q$);
reset role;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
do $$
declare v_total int; v_failed int;
begin
  select count(*), count(*) filter (where not ok) into v_total, v_failed from tests.results;
  raise notice '# % checks total, % failed (phases 2-9 + ops)', v_total, v_failed;
  if v_failed > 0 then
    raise exception 'ops monitoring tests failed: % of %', v_failed, v_total;
  end if;
end $$;
