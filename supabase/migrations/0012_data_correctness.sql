-- Phase 3 — Data correctness.
--
--  * create_purchase_order: one transaction for the order and its lines, with
--    the total computed server-side instead of trusting the client.
--  * staff_performance / financial_summary: real aggregates from purchases,
--    replacing the seeded STAFF_DATA and FINANCIALS fixtures in the UI.
--  * app_feedback FK/nullability consistency is asserted here so it cannot
--    regress.

-- ===========================================================================
-- 1. Atomic purchase-order creation
-- ===========================================================================
create or replace function public.create_purchase_order(
  p_pharmacy_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_whatsapp_message text default null,
  p_currency text default 'USD',
  p_status public.purchase_order_status default 'sent'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pharmacy uuid;
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price numeric;
  v_total numeric := 0;
  v_count int;
begin
  select up.pharmacy_id into v_pharmacy from public.users_profiles up where up.id = auth.uid();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_pharmacy is distinct from p_pharmacy_id then
    raise exception 'forbidden: pharmacy mismatch' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id and s.pharmacy_id = p_pharmacy_id) then
    raise exception 'supplier does not belong to this pharmacy' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 500 then
    raise exception 'a purchase order must contain between 1 and 500 lines';
  end if;

  -- Validate everything before writing anything.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := coalesce((v_item->>'qty')::int, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, -1);
    if v_qty < 1 or v_qty > 1000000 then
      raise exception 'invalid order quantity: %', v_qty;
    end if;
    if v_unit_price < 0 or v_unit_price > 1000000 then
      raise exception 'invalid order unit price: %', v_unit_price;
    end if;
    if v_product_id is not null
       and not exists (select 1 from public.products pr where pr.id = v_product_id and pr.pharmacy_id = p_pharmacy_id) then
      raise exception 'product does not belong to this pharmacy' using errcode = '42501';
    end if;
    v_total := v_total + (v_qty * v_unit_price);
  end loop;

  insert into public.purchase_orders (pharmacy_id, supplier_id, status, ordered_at, currency, total, whatsapp_message, created_by)
  values (p_pharmacy_id, p_supplier_id, coalesce(p_status, 'sent'),
          case when coalesce(p_status, 'sent') = 'draft' then null else now() end,
          coalesce(nullif(trim(p_currency), ''), 'USD'), v_total, left(p_whatsapp_message, 4000), auth.uid())
  returning id into v_order_id;

  insert into public.purchase_order_items (pharmacy_id, purchase_order_id, product_id, name, qty, unit_price, line_total)
  select p_pharmacy_id,
         v_order_id,
         nullif(i->>'product_id', '')::uuid,
         left(coalesce(nullif(trim(i->>'name'), ''), 'Item'), 200),
         (i->>'qty')::int,
         (i->>'unit_price')::numeric,
         (i->>'qty')::int * (i->>'unit_price')::numeric
  from jsonb_array_elements(p_items) i;

  return v_order_id;
end $$;

-- ===========================================================================
-- 2. Real staff performance (replaces the seeded STAFF_DATA fixture)
-- ===========================================================================
create or replace function public.staff_performance(p_days int default 7)
returns table (
  user_id uuid,
  name text,
  role public.user_role,
  last_seen_at timestamptz,
  sales_total numeric,
  transactions int,
  avg_sale numeric,
  daily jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pharmacy uuid;
  v_role public.user_role;
  v_days int := least(greatest(coalesce(p_days, 7), 1), 365);
begin
  select up.pharmacy_id, up.role into v_pharmacy, v_role
  from public.users_profiles up where up.id = auth.uid();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden: owner only' using errcode = '42501';
  end if;

  return query
  with member as (
    select up.id, up.name, up.role, up.last_seen_at
    from public.users_profiles up
    where up.pharmacy_id = v_pharmacy
  ),
  sales as (
    select p.staff_id, p.amount, p.purchased_at::date as d
    from public.purchases p
    where p.pharmacy_id = v_pharmacy
      and p.purchased_at >= date_trunc('day', now()) - make_interval(days => v_days - 1)
  )
  select m.id, m.name, m.role, m.last_seen_at,
         coalesce(sum(s.amount), 0)::numeric,
         count(s.*)::int,
         case when count(s.*) > 0 then round(coalesce(sum(s.amount), 0) / count(s.*), 2) else 0 end,
         coalesce((
           select jsonb_agg(jsonb_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'total', coalesce(t.total, 0)) order by g.d)
           from generate_series(
                  (date_trunc('day', now()) - make_interval(days => v_days - 1))::date,
                  date_trunc('day', now())::date,
                  interval '1 day') g(d)
           left join (
             select s2.d, sum(s2.amount) total from sales s2 where s2.staff_id = m.id group by s2.d
           ) t on t.d = g.d
         ), '[]'::jsonb)
  from member m
  left join sales s on s.staff_id = m.id
  group by m.id, m.name, m.role, m.last_seen_at
  order by 5 desc, m.name;
end $$;

-- ===========================================================================
-- 3. Real financial summary (replaces the seeded FINANCIALS fixture)
--    Only figures the database can actually support. Expenses, cash on hand
--    and supplier debt are NOT tracked anywhere yet, so they are deliberately
--    absent instead of invented; the UI labels them as not tracked.
-- ===========================================================================
create or replace function public.financial_summary(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pharmacy uuid;
  v_role public.user_role;
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from timestamptz;
  v_result jsonb;
begin
  select up.pharmacy_id, up.role into v_pharmacy, v_role
  from public.users_profiles up where up.id = auth.uid();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden: owner only' using errcode = '42501';
  end if;

  v_from := date_trunc('day', now()) - make_interval(days => v_days - 1);

  select jsonb_build_object(
    'window_days', v_days,
    'generated_at', now(),
    'revenue', jsonb_build_object(
      'total', coalesce((select sum(p.amount) from public.purchases p
                         where p.pharmacy_id = v_pharmacy and p.purchased_at >= v_from), 0),
      'today', coalesce((select sum(p.amount) from public.purchases p
                         where p.pharmacy_id = v_pharmacy and p.purchased_at >= date_trunc('day', now())), 0),
      'transactions', coalesce((select count(*) from public.purchases p
                                where p.pharmacy_id = v_pharmacy and p.purchased_at >= v_from), 0),
      'by_method', coalesce((
        select jsonb_agg(jsonb_build_object('method', m.method, 'total', m.total, 'count', m.cnt) order by m.total desc)
        from (select p.method, sum(p.amount) total, count(*) cnt
              from public.purchases p
              where p.pharmacy_id = v_pharmacy and p.purchased_at >= v_from
              group by p.method) m), '[]'::jsonb),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'total', coalesce(t.total, 0)) order by g.d)
        from generate_series(v_from::date, date_trunc('day', now())::date, interval '1 day') g(d)
        left join (select p.purchased_at::date d, sum(p.amount) total
                   from public.purchases p
                   where p.pharmacy_id = v_pharmacy and p.purchased_at >= v_from
                   group by p.purchased_at::date) t on t.d = g.d), '[]'::jsonb)
    ),
    -- Cost of goods sold, from the recorded line items and the product's unit cost.
    'cogs', jsonb_build_object(
      'total', coalesce((select sum(pi.qty * pr.unit_cost)
                         from public.purchase_items pi
                         join public.products pr on pr.id = pi.product_id
                         join public.purchases p on p.id = pi.purchase_id
                         where pi.pharmacy_id = v_pharmacy and p.purchased_at >= v_from), 0),
      'covered_line_items', coalesce((select count(*) from public.purchase_items pi
                                      join public.purchases p on p.id = pi.purchase_id
                                      where pi.pharmacy_id = v_pharmacy and p.purchased_at >= v_from
                                        and pi.product_id is not null), 0),
      'untracked_line_items', coalesce((select count(*) from public.purchase_items pi
                                        join public.purchases p on p.id = pi.purchase_id
                                        where pi.pharmacy_id = v_pharmacy and p.purchased_at >= v_from
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
end $$;

-- ===========================================================================
-- 4. Telemetry FK / nullability consistency (asserted, not assumed)
-- ===========================================================================
do $$
begin
  -- app_feedback.user_id must stay nullable, because its FK is ON DELETE SET NULL.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_feedback'
      and column_name = 'user_id' and is_nullable = 'NO'
  ) then
    alter table public.app_feedback alter column user_id drop not null;
  end if;

  -- app_events.user_id is NOT NULL, so its FK must cascade rather than SET NULL.
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_events_pharmacy_user_fkey' and confdeltype = 'c'
  ) then
    raise exception 'app_events user FK must be ON DELETE CASCADE';
  end if;
end $$;

-- ===========================================================================
-- 5. Privileges for the new functions
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_purchase_order', 'staff_performance', 'financial_summary')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
