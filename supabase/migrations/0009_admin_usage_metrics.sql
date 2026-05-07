-- Phase 7: admin usage metrics snapshot

create or replace function public.admin_usage_snapshot(p_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'days', p_days,
    'dau', (
      select count(distinct user_id)
      from public.app_events
      where created_at > now() - make_interval(days => 1)
    ),
    'purchases_24h', (
      select count(*) from public.app_events
      where event_name = 'purchase_recorded'
        and created_at > now() - interval '24 hours'
    ),
    'inventory_adjustments_24h', (
      select count(*) from public.app_events
      where event_name = 'inventory_adjusted'
        and created_at > now() - interval '24 hours'
    ),
    'top_modules', (
      select coalesce(jsonb_agg(jsonb_build_object('module', module, 'views', views) order by views desc), '[]'::jsonb)
      from (
        select module, count(*) as views
        from public.app_events
        where event_name = 'module_view'
          and created_at > now() - make_interval(days => p_days)
          and module is not null
        group by module
        order by count(*) desc
        limit 8
      ) t
    ),
    'dropoffs', (
      select coalesce(jsonb_agg(jsonb_build_object('path', path, 'hits', hits) order by hits desc), '[]'::jsonb)
      from (
        select path, count(*) as hits
        from public.app_events
        where event_name = 'route_view'
          and created_at > now() - make_interval(days => p_days)
          and path is not null
        group by path
        order by count(*) desc
        limit 10
      ) d
    )
  )
  where public.is_admin();
$$;

