-- Phase 4: customer fields + record_purchase RPC
-- Goal: support current UI shape and atomic purchase recording.

-- 1) Extend customers table to match UI fields
alter table public.customers
  add column if not exists alt_phone text,
  add column if not exists alt_name text,
  add column if not exists dob date,
  add column if not exists gender text,
  add column if not exists registered_at date not null default (now()::date),
  add column if not exists conditions text[] not null default '{}',
  add column if not exists allergies text[] not null default '{}',
  add column if not exists last_visit date not null default (now()::date),
  add column if not exists visit_count int not null default 0,
  add column if not exists total_spend numeric not null default 0;

create index if not exists customers_last_visit_idx on public.customers(last_visit desc);

-- 2) record_purchase RPC:
-- - inserts purchase
-- - inserts purchase_items
-- - decrements inventory via stock_movements + inventory update
-- - updates customer totals and credit_balance if method == 'Credit'

create or replace function public.record_purchase(
  p_pharmacy_id uuid,
  p_customer_id uuid,
  p_method text,
  p_staff_id uuid,
  p_items jsonb
) returns uuid
language plpgsql
security definer
as $$
declare
  v_purchase_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price numeric;
  v_name text;
begin
  -- compute totals
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'qty')::int, 1);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_total := v_total + (v_qty * v_unit_price);
  end loop;

  insert into public.purchases (pharmacy_id, customer_id, purchased_at, items_text, amount, method, staff_id, created_at)
  values (p_pharmacy_id, p_customer_id, now(), '', v_total, p_method, p_staff_id, now())
  returning id into v_purchase_id;

  -- Insert line items + adjust stock
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := coalesce((v_item->>'qty')::int, 1);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_name := coalesce(v_item->>'name', 'Item');

    insert into public.purchase_items (pharmacy_id, purchase_id, product_id, name, qty, unit_price, line_total, created_at)
    values (p_pharmacy_id, v_purchase_id, v_product_id, v_name, v_qty, v_unit_price, (v_qty * v_unit_price), now());

    if v_product_id is not null then
      -- movement negative reduces stock
      insert into public.stock_movements (pharmacy_id, product_id, delta, note, occurred_at, created_by)
      values (p_pharmacy_id, v_product_id, -abs(v_qty), 'sale', now(), p_staff_id);

      insert into public.inventory (pharmacy_id, product_id, stock, created_at, updated_at)
      values (p_pharmacy_id, v_product_id, greatest(0, -abs(v_qty)), now(), now())
      on conflict (pharmacy_id, product_id)
      do update set stock = greatest(0, public.inventory.stock - abs(v_qty)), updated_at = now();
    end if;
  end loop;

  -- Update purchase items_text for display/export compatibility
  update public.purchases
  set items_text = (
    select string_agg(name || ' x' || qty, ', ' order by created_at)
    from public.purchase_items
    where purchase_id = v_purchase_id
  )
  where id = v_purchase_id;

  -- Update customer aggregates
  update public.customers
  set
    total_spend = total_spend + v_total,
    visit_count = visit_count + 1,
    last_visit = now()::date,
    credit_balance = case when p_method = 'Credit' then credit_balance + v_total else credit_balance end,
    updated_at = now()
  where id = p_customer_id and pharmacy_id = p_pharmacy_id;

  return v_purchase_id;
end;
$$;

