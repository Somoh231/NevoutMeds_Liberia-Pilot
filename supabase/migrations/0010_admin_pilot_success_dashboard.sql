-- Phase 7 hardening: Pilot Success Dashboard (admin-only aggregates)

create or replace function public.admin_pilot_success_dashboard(p_days int default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  guard as (
    select public.is_admin() as ok
  ),
  pharmacies_all as (
    select id, name, created_at
    from public.pharmacies
  ),
  -- consider "activity" as any app_event OR purchase OR stock_movement
  activity as (
    select pharmacy_id, created_at::date as d, created_at
    from public.app_events
    union all
    select pharmacy_id, purchased_at::date as d, purchased_at as created_at
    from public.purchases
    union all
    select pharmacy_id, occurred_at::date as d, occurred_at as created_at
    from public.stock_movements
  ),
  active_7 as (
    select count(distinct pharmacy_id)::int as cnt
    from activity
    where created_at > now() - interval '7 days'
  ),
  active_30 as (
    select count(distinct pharmacy_id)::int as cnt
    from activity
    where created_at > now() - interval '30 days'
  ),
  wau as (
    select count(distinct user_id)::int as cnt
    from public.app_events
    where created_at > now() - interval '7 days'
  ),
  purchases_today as (
    select count(*)::int as cnt
    from public.purchases
    where purchased_at >= date_trunc('day', now())
  ),
  purchases_7 as (
    select count(*)::int as cnt
    from public.purchases
    where purchased_at > now() - interval '7 days'
  ),
  purchases_trend as (
    select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', cnt) order by day), '[]'::jsonb) as v
    from (
      select
        to_char(d, 'YYYY-MM-DD') as day,
        count(*)::int as cnt
      from public.purchases
      where purchased_at >= date_trunc('day', now()) - interval '6 days'
      group by d
      order by d
    ) t
  ),
  stock_adj_7 as (
    select count(*)::int as cnt
    from public.stock_movements
    where occurred_at > now() - interval '7 days'
      and note is not null
  ),
  imports_7 as (
    select count(*)::int as cnt
    from public.app_events
    where event_name = 'import_completed'
      and created_at > now() - interval '7 days'
  ),
  inventory_trend as (
    select coalesce(jsonb_agg(jsonb_build_object('day', day, 'adjustments', adj, 'imports', imp) order by day), '[]'::jsonb) as v
    from (
      with days as (
        select (date_trunc('day', now()) - (i * interval '1 day'))::date as d
        from generate_series(0, 6) i
      )
      select
        to_char(days.d, 'YYYY-MM-DD') as day,
        coalesce(sm.cnt, 0)::int as adj,
        coalesce(im.cnt, 0)::int as imp
      from days
      left join (
        select occurred_at::date as d, count(*)::int as cnt
        from public.stock_movements
        where occurred_at >= date_trunc('day', now()) - interval '6 days'
        group by occurred_at::date
      ) sm on sm.d = days.d
      left join (
        select created_at::date as d, count(*)::int as cnt
        from public.app_events
        where event_name = 'import_completed'
          and created_at >= date_trunc('day', now()) - interval '6 days'
        group by created_at::date
      ) im on im.d = days.d
      order by days.d
    ) t
  ),
  features as (
    select coalesce(jsonb_agg(jsonb_build_object('feature', feature, 'views', views) order by views desc), '[]'::jsonb) as v
    from (
      select module as feature, count(*)::int as views
      from public.app_events
      where event_name = 'module_view'
        and created_at > now() - make_interval(days => p_days)
        and module is not null
      group by module
      order by count(*) desc
      limit 12
    ) t
  ),
  feedback as (
    select
      count(*) filter (where kind = 'issue')::int as issues,
      count(*) filter (where kind = 'feature')::int as features,
      round(avg(rating)::numeric, 2) as avg_rating
    from public.app_feedback
    where created_at > now() - interval '30 days'
  ),
  retention as (
    select coalesce(jsonb_agg(row_to_json(r) order by r.status_order asc, r.last_active_at desc nulls last), '[]'::jsonb) as v
    from (
      with per_pharmacy as (
        select
          ph.id as pharmacy_id,
          ph.name as pharmacy_name,
          max(a.created_at) as last_active_at,
          count(distinct a.d) filter (where a.d >= (now() - interval '30 days')::date)::int as active_days_30,
          (select count(*)::int from public.users_profiles up where up.pharmacy_id = ph.id) as users_count,
          (select count(*)::int from public.purchases p where p.pharmacy_id = ph.id) as total_purchases
        from pharmacies_all ph
        left join activity a on a.pharmacy_id = ph.id
        group by ph.id, ph.name
      )
      select
        pharmacy_id,
        pharmacy_name,
        last_active_at,
        active_days_30,
        users_count,
        total_purchases,
        case
          when last_active_at is null then 'inactive'
          when last_active_at > now() - interval '7 days' and active_days_30 >= 7 then 'healthy'
          when last_active_at > now() - interval '30 days' then 'at risk'
          else 'inactive'
        end as status,
        case
          when last_active_at is null then 3
          when last_active_at > now() - interval '7 days' and active_days_30 >= 7 then 1
          when last_active_at > now() - interval '30 days' then 2
          else 3
        end as status_order
      from per_pharmacy
    ) r
  )
  select
    case when (select ok from guard) is not true then null else
      jsonb_build_object(
        'active_pharmacies', jsonb_build_object(
          'total_onboarded', (select count(*)::int from pharmacies_all),
          'active_7d', (select cnt from active_7),
          'active_30d', (select cnt from active_30)
        ),
        'weekly_active_users', (select cnt from wau),
        'purchases', jsonb_build_object(
          'today', (select cnt from purchases_today),
          'last_7d', (select cnt from purchases_7),
          'trend', (select v from purchases_trend)
        ),
        'inventory_updates', jsonb_build_object(
          'stock_adjustments_7d', (select cnt from stock_adj_7),
          'imports_completed_7d', (select cnt from imports_7),
          'trend', (select v from inventory_trend)
        ),
        'most_used_features', (select v from features),
        'feedback', jsonb_build_object(
          'issues_submitted_30d', (select issues from feedback),
          'feature_requests_30d', (select features from feedback),
          'avg_satisfaction_rating_30d', (select avg_rating from feedback)
        ),
        'retention_by_pharmacy', (select v from retention)
      )
    end;
$$;

