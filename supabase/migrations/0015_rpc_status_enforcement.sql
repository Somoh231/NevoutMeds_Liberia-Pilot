-- Phase 4 — make every existing RPC status-aware.
--
-- The Phase 2/3 RPCs looked the caller up directly in users_profiles, so a
-- suspended or offboarded user could still record purchases, adjust stock or
-- read financials with a JWT their browser already held. They now resolve the
-- caller through private.pharmacy_id()/private.user_role(), which only return a
-- tenant for an ACTIVE profile. Bodies are otherwise unchanged from 0011/0012.

-- adjust_stock (body from 0011_rls_tenant_security_hardening.sql)
create or replace function public.adjust_stock(
  p_pharmacy_id uuid,
  p_product_id uuid,
  p_delta int,
  p_note text default null
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pharmacy uuid;
  v_stock int;
begin
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- Admins are read-only outside their own pharmacy.
  if v_pharmacy is distinct from p_pharmacy_id then
    raise exception 'forbidden: pharmacy mismatch' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'stock adjustment must be a non-zero whole number';
  end if;
  if abs(p_delta) > 1000000 then
    raise exception 'stock adjustment out of range';
  end if;
  if not exists (select 1 from public.products pr where pr.id = p_product_id and pr.pharmacy_id = p_pharmacy_id) then
    raise exception 'product does not belong to this pharmacy' using errcode = '42501';
  end if;

  insert into public.inventory (pharmacy_id, product_id, stock)
  values (p_pharmacy_id, p_product_id, 0)
  on conflict (pharmacy_id, product_id) do nothing;

  -- Single statement => row-level lock, safe under concurrency.
  update public.inventory
     set stock = stock + p_delta, updated_at = now()
   where pharmacy_id = p_pharmacy_id and product_id = p_product_id
  returning stock into v_stock;

  if v_stock < 0 then
    raise exception 'insufficient stock: adjustment would leave % units', v_stock;
  end if;

  insert into public.stock_movements (pharmacy_id, product_id, delta, note, occurred_at, created_by)
  values (p_pharmacy_id, p_product_id, p_delta, left(p_note, 500), now(), auth.uid());

  return v_stock;
end $$;

-- record_purchase (body from 0011_rls_tenant_security_hardening.sql)
create or replace function public.record_purchase(
  p_pharmacy_id uuid,
  p_customer_id uuid,
  p_method text,
  p_staff_id uuid,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pharmacy uuid;
  v_purchase_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price numeric;
  v_name text;
  v_stock int;
  v_count int;
begin
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_pharmacy is distinct from p_pharmacy_id then
    raise exception 'forbidden: pharmacy mismatch' using errcode = '42501';
  end if;
  -- The caller may not attribute a sale to somebody else.
  if p_staff_id is not null and p_staff_id <> auth.uid() then
    raise exception 'forbidden: staff mismatch' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('Cash','Mobile Money','Credit','Diaspora Pay','Insurance') then
    raise exception 'invalid payment method: %', coalesce(p_method, 'null');
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.pharmacy_id = p_pharmacy_id) then
    raise exception 'customer does not belong to this pharmacy' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 200 then
    raise exception 'a purchase must contain between 1 and 200 items';
  end if;

  -- Validate every line before writing anything.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := coalesce((v_item->>'qty')::int, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, -1);
    if v_qty < 1 or v_qty > 100000 then
      raise exception 'invalid quantity: %', v_qty;
    end if;
    if v_unit_price < 0 or v_unit_price > 1000000 then
      raise exception 'invalid unit price: %', v_unit_price;
    end if;
    if v_product_id is not null
       and not exists (select 1 from public.products pr where pr.id = v_product_id and pr.pharmacy_id = p_pharmacy_id) then
      raise exception 'product does not belong to this pharmacy' using errcode = '42501';
    end if;
    v_total := v_total + (v_qty * v_unit_price);
  end loop;

  insert into public.purchases (pharmacy_id, customer_id, purchased_at, items_text, amount, method, staff_id, created_at)
  values (p_pharmacy_id, p_customer_id, now(), '', v_total, p_method, auth.uid(), now())
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := (v_item->>'qty')::int;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_name := left(coalesce(nullif(trim(v_item->>'name'), ''), 'Item'), 200);

    insert into public.purchase_items (pharmacy_id, purchase_id, product_id, name, qty, unit_price, line_total, created_at)
    values (p_pharmacy_id, v_purchase_id, v_product_id, v_name, v_qty, v_unit_price, v_qty * v_unit_price, now());

    if v_product_id is not null then
      insert into public.inventory (pharmacy_id, product_id, stock)
      values (p_pharmacy_id, v_product_id, 0)
      on conflict (pharmacy_id, product_id) do nothing;

      update public.inventory
         set stock = stock - v_qty, updated_at = now()
       where pharmacy_id = p_pharmacy_id and product_id = v_product_id
      returning stock into v_stock;

      if v_stock < 0 then
        raise exception 'insufficient stock for % (short by % units)', v_name, abs(v_stock);
      end if;

      insert into public.stock_movements (pharmacy_id, product_id, delta, note, occurred_at, created_by)
      values (p_pharmacy_id, v_product_id, -v_qty, 'sale', now(), auth.uid());
    end if;
  end loop;

  update public.purchases
     set items_text = coalesce((
       select string_agg(pi.name || ' x' || pi.qty, ', ' order by pi.created_at)
       from public.purchase_items pi where pi.purchase_id = v_purchase_id), '')
   where id = v_purchase_id;

  update public.customers
     set total_spend = total_spend + v_total,
         visit_count = visit_count + 1,
         last_visit = now()::date,
         credit_balance = case when p_method = 'Credit' then credit_balance + v_total else credit_balance end,
         updated_at = now()
   where id = p_customer_id and pharmacy_id = p_pharmacy_id;

  return v_purchase_id;
end $$;

-- create_product (body from 0011_rls_tenant_security_hardening.sql)
create or replace function public.create_product(
  p_pharmacy_id uuid,
  p_name text,
  p_category text,
  p_unit_cost numeric,
  p_selling_price numeric,
  p_stock int default 0,
  p_brand text default null,
  p_unit text default null,
  p_reorder_point int default 0,
  p_max_stock int default 0,
  p_daily_velocity numeric default 0,
  p_batch_id text default null,
  p_expiry_date date default null,
  p_is_essential boolean default false,
  p_requires_prescription boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pharmacy uuid;
  v_product_id uuid;
begin
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_pharmacy is distinct from p_pharmacy_id then
    raise exception 'forbidden: pharmacy mismatch' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_category), '') = '' then
    raise exception 'product name and category are required';
  end if;
  if p_unit_cost < 0 or p_selling_price < 0 or p_stock < 0 or p_reorder_point < 0 or p_max_stock < 0 or p_daily_velocity < 0 then
    raise exception 'product values cannot be negative';
  end if;

  insert into public.products (pharmacy_id, name, brand, category, unit, unit_cost, selling_price,
                               daily_velocity, reorder_point, max_stock, is_essential, requires_prescription)
  values (p_pharmacy_id, left(trim(p_name), 200), p_brand, left(trim(p_category), 100), p_unit, p_unit_cost, p_selling_price,
          p_daily_velocity, p_reorder_point, p_max_stock, coalesce(p_is_essential, false), coalesce(p_requires_prescription, false))
  returning id into v_product_id;

  insert into public.inventory (pharmacy_id, product_id, stock, batch_id, expiry_date)
  values (p_pharmacy_id, v_product_id, p_stock, p_batch_id, p_expiry_date);

  if p_stock > 0 then
    insert into public.stock_movements (pharmacy_id, product_id, delta, note, occurred_at, created_by)
    values (p_pharmacy_id, v_product_id, p_stock, 'opening stock', now(), auth.uid());
  end if;

  return v_product_id;
end $$;

-- import_inventory_levels (body from 0011_rls_tenant_security_hardening.sql)
create or replace function public.import_inventory_levels(
  p_pharmacy_id uuid,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
end $$;

-- create_purchase_order (body from 0012_data_correctness.sql)
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
  v_pharmacy := private.pharmacy_id();  -- active profiles only
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

-- staff_performance (body from 0012_data_correctness.sql)
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
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  v_role := private.user_role();
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

-- financial_summary (body from 0012_data_correctness.sql)
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
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  v_role := private.user_role();
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


-- Re-assert privileges for the recreated functions.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('adjust_stock','record_purchase','create_product','import_inventory_levels',
                        'create_purchase_order','staff_performance','financial_summary')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
