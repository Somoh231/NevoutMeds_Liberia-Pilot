-- NevOut Meds backup manifest: one JSON document describing a database.
-- Computed on the source at backup time and on the target after a restore;
-- the restore is valid only if the two agree (rows, schema fingerprint,
-- country registry, integrity invariants).
create temp table if not exists nv_manifest_rows (tbl text primary key, n bigint);
truncate nv_manifest_rows;
-- Applied migrations, when the database tracks them (hosted Supabase does).
create temp table if not exists nv_manifest_migrations (m jsonb);
truncate nv_manifest_migrations;
do $$
declare r record; n bigint;
begin
  for r in
    select table_schema s, table_name t from information_schema.tables
    where table_type = 'BASE TABLE' and (
      table_schema in ('public', 'private')
      or (table_schema = 'auth' and table_name in ('users', 'identities'))
      or (table_schema = 'supabase_migrations' and table_name = 'schema_migrations'))
  loop
    execute format('select count(*) from %I.%I', r.s, r.t) into n;
    insert into nv_manifest_rows values (r.s || '.' || r.t, n);
  end loop;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'insert into nv_manifest_migrations select jsonb_agg(version order by version) from supabase_migrations.schema_migrations';
  else
    insert into nv_manifest_migrations values (null);
  end if;
end $$;

with objs as (
  select 'column' k, table_schema||'.'||table_name||'.'||column_name n, data_type||'|'||is_nullable||'|'||coalesce(column_default,'') v
  from information_schema.columns where table_schema in ('public','private')
  union all
  select 'constraint', n.nspname||'.'||c.conrelid::regclass::text||'.'||c.conname, pg_get_constraintdef(c.oid)
  from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','private')
  union all
  select 'policy', schemaname||'.'||tablename||'.'||policyname, cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
  from pg_policies where schemaname in ('public','private')
  union all
  -- Platform-managed helpers (e.g. Supabase's rls_auto_enable) are not part of the app schema.
  select 'function', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', md5(p.prosrc)||'|'||p.prosecdef||'|'||coalesce(array_to_string(p.proconfig,','),'')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.proname <> 'rls_auto_enable'
  union all
  select 'trigger', t.tgrelid::regclass::text||'.'||t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and not t.tgisinternal
  union all
  select 'rls', n.nspname||'.'||c.relname, c.relrowsecurity::text||'|'||c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'
  union all
  select 'grant', table_schema||'.'||table_name||'.'||grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants where table_schema in ('public','private') and grantee in ('anon','authenticated','service_role')
  group by table_schema, table_name, grantee
)
select jsonb_build_object(
  'server_version', current_setting('server_version'),
  'generated_at', now(),
  'rows', (select jsonb_object_agg(tbl, n order by tbl) from nv_manifest_rows),
  'fingerprint', (select jsonb_object_agg(k, jsonb_build_object('objects', cnt, 'md5', h))
                  from (select k, count(*) cnt, md5(string_agg(n || '=' || md5(v), ',' order by n)) h from objs group by k) f),
  'rls_disabled_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                          where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  'country_registry_md5', (select md5(string_agg(code||name||currencies::text||timezones::text||locales::text||payment_methods::text||default_payment_methods::text, ',' order by code))
                           from private.country_rules),
  'migrations', (select m from nv_manifest_migrations),
  'integrity', jsonb_build_object(
    'negative_stock', (select count(*) from public.inventory where stock < 0),
    'duplicate_purchases', (select count(*) from (select 1 from public.purchases group by pharmacy_id, customer_id, amount, purchased_at having count(*) > 1) d),
    'unstamped_sales', (select count(*) from public.purchases where currency_code is null),
    'stock_movement_mismatch', (select count(*) from (
        select 1 from public.inventory i left join public.stock_movements m on m.product_id = i.product_id and m.pharmacy_id = i.pharmacy_id
        group by i.pharmacy_id, i.product_id, i.stock having i.stock <> coalesce(sum(m.delta), 0)) x),
    'sales_total_by_currency', coalesce((select jsonb_object_agg(currency_code, total) from (select currency_code, sum(amount) total from public.purchases group by 1) s), '{}'::jsonb)
  )
)::text as manifest;
