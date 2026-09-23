-- NevOut Meds pilot metrics — READ-ONLY. Run in the Supabase SQL editor (or psql).
-- Replace 'PHARMACY NAME' with the pilot pharmacy's exact name (Settings → General). Window: last 14 days.
-- See docs/pilot/PILOT_SUCCESS_METRICS.md for what each result means.
-- M1 Daily adoption: sales, sellers, revenue per business day
with p as (select id, timezone from public.pharmacies where name = 'PHARMACY NAME')
select (pu.purchased_at at time zone p.timezone)::date as business_day,
       count(*) as sales, count(distinct pu.staff_id) as people_selling,
       round(sum(pu.amount), 2) as revenue, string_agg(distinct pu.currency_code, ',') as currency
from public.purchases pu join p on pu.pharmacy_id = p.id
where pu.purchased_at > now() - interval '14 days'
group by 1 order by 1;

-- M2 Usage per person (sales, stock changes, last seen)
with p as (select id from public.pharmacies where name = 'PHARMACY NAME')
select up.name, up.role, up.status, up.last_seen_at,
       (select count(*) from public.purchases pu where pu.pharmacy_id = p.id and pu.staff_id = up.id and pu.purchased_at > now() - interval '14 days') as sales_14d,
       (select count(*) from public.stock_movements m where m.pharmacy_id = p.id and m.created_by = up.id and m.note is distinct from 'sale' and m.occurred_at > now() - interval '14 days') as stock_changes_14d
from public.users_profiles up join p on up.pharmacy_id = p.id
order by sales_14d desc;

-- M3 Stock changes by reason (excluding sales)
with p as (select id from public.pharmacies where name = 'PHARMACY NAME')
select coalesce(nullif(split_part(m.note, ' – ', 1), ''), '(no reason)') as reason, count(*) as changes, sum(m.delta) as net_units
from public.stock_movements m join p on m.pharmacy_id = p.id
where m.note is distinct from 'sale' and m.occurred_at > now() - interval '14 days'
group by 1 order by 2 desc;

-- M4 Reliability: device-reported sync problems, app errors, conflicts cleared
with p as (select id from public.pharmacies where name = 'PHARMACY NAME')
select
  (select count(*) from public.purchases pu where pu.pharmacy_id = p.id and pu.purchased_at > now() - interval '14 days') as sales_saved,
  (select count(*) from public.app_logs l where l.pharmacy_id = p.id and l.message = 'sync_conflict' and l.context->>'mutation_type' = 'record_purchase' and l.created_at > now() - interval '14 days') as sales_refused,
  (select count(*) from public.app_logs l where l.pharmacy_id = p.id and l.message = 'sync_conflict' and l.created_at > now() - interval '14 days') as conflicts_all,
  (select count(*) from public.app_events e where e.pharmacy_id = p.id and e.event_name = 'sync_conflict_dismissed' and e.created_at > now() - interval '14 days') as conflicts_cleared,
  (select count(*) from public.app_logs l where l.pharmacy_id = p.id and l.message = 'sync_failed' and l.created_at > now() - interval '14 days') as sync_failures,
  (select count(*) from public.app_logs l where l.pharmacy_id = p.id and l.level = 'error' and l.message not like 'sync\_%' and l.message not like 'storage\_%' and l.created_at > now() - interval '14 days') as app_errors
from p;

-- M5 Expiry value surfaced (at cost), by window
with p as (select id, timezone from public.pharmacies where name = 'PHARMACY NAME')
select case when i.expiry_date < (now() at time zone p.timezone)::date then 'expired'
            when i.expiry_date < (now() at time zone p.timezone)::date + 30 then 'within 30 days'
            else '30–90 days' end as window,
       count(*) as products, round(sum(i.stock * pr.unit_cost), 2) as value_at_cost
from public.inventory i join public.products pr on pr.id = i.product_id join p on i.pharmacy_id = p.id
where i.stock > 0 and i.expiry_date < (now() at time zone p.timezone)::date + 90
group by 1 order by 1;

-- M6 Supplier savings opportunities: products with 2+ supplier prices in the same currency
with p as (select id from public.pharmacies where name = 'PHARMACY NAME')
select lower(c.product_name) as product, c.currency, count(distinct c.supplier_id) as suppliers,
       min(c.unit_cost) as best_price, max(c.unit_cost) as worst_price, max(c.unit_cost) - min(c.unit_cost) as saving_per_unit
from public.supplier_catalogue c join p on c.pharmacy_id = p.id
where c.is_active
group by 1, 2 having count(distinct c.supplier_id) >= 2
order by saving_per_unit desc limit 20;

-- M7 Stock-out and low-stock now
with p as (select id from public.pharmacies where name = 'PHARMACY NAME')
select count(*) filter (where coalesce(i.stock, 0) = 0) as out_of_stock,
       count(*) filter (where coalesce(i.stock, 0) > 0 and pr.reorder_point > 0 and i.stock <= pr.reorder_point) as at_or_below_reorder,
       count(*) filter (where pr.reorder_point = 0) as no_reorder_level
from public.products pr left join public.inventory i on i.product_id = pr.id join p on pr.pharmacy_id = p.id;

-- M8 Feature usage (screens opened) and in-app feedback
with p as (select id from public.pharmacies where name = 'PHARMACY NAME')
select coalesce(e.module, e.metadata->>'screen', e.path) as feature, count(*) as opens, count(distinct e.user_id) as people
from public.app_events e join p on e.pharmacy_id = p.id
where e.event_name in ('module_view', 'route_view') and e.created_at > now() - interval '14 days'
group by 1 order by 2 desc;

with p as (select id from public.pharmacies where name = 'PHARMACY NAME')
select f.kind, count(*) as items, round(avg(f.rating), 1) as avg_rating
from public.app_feedback f join p on f.pharmacy_id = p.id
where f.created_at > now() - interval '14 days'
group by 1;
