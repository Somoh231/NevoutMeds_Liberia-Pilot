-- Phase 5: Row Level Security + tenant isolation hardening
-- Applies RLS policies for all pharmacy-scoped tables and hardens RPCs.

-- Helper: determine caller pharmacy + role via auth.uid()
create or replace function public.current_profile()
returns table (user_id uuid, pharmacy_id uuid, role public.user_role)
language sql
stable
security invoker
as $$
  select up.id as user_id, up.pharmacy_id, up.role
  from public.users_profiles up
  where up.id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
as $$
  select exists(select 1 from public.current_profile() p where p.role = 'admin')
$$;

create or replace function public.same_pharmacy(p_pharmacy_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists(select 1 from public.current_profile() p where p.pharmacy_id = p_pharmacy_id)
$$;

-- =========================
-- Enable RLS
-- =========================
alter table public.users_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_catalogue enable row level security;
alter table public.documents enable row level security;
alter table public.reminders enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- =========================
-- Policies: USERS_PROFILES
-- Rules:
-- - user can read own profile
-- - owner/admin can read profiles in same pharmacy
-- - owner can manage staff in same pharmacy (but cannot create/promote admin)
-- - admin can manage any profile
-- =========================
drop policy if exists "users_profiles_select" on public.users_profiles;
create policy "users_profiles_select"
on public.users_profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    public.same_pharmacy(pharmacy_id)
    and exists(select 1 from public.current_profile() p where p.role in ('owner','admin'))
  )
);

drop policy if exists "users_profiles_insert" on public.users_profiles;
create policy "users_profiles_insert"
on public.users_profiles
for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.same_pharmacy(pharmacy_id)
    and exists(select 1 from public.current_profile() p where p.role = 'owner')
    and role <> 'admin'
  )
);

drop policy if exists "users_profiles_update" on public.users_profiles;
create policy "users_profiles_update"
on public.users_profiles
for update
to authenticated
using (
  public.is_admin()
  or (
    public.same_pharmacy(pharmacy_id)
    and exists(select 1 from public.current_profile() p where p.role = 'owner')
  )
  or id = auth.uid()
)
with check (
  public.is_admin()
  or (
    public.same_pharmacy(pharmacy_id)
    and exists(select 1 from public.current_profile() p where p.role = 'owner')
    and role <> 'admin'
  )
  or id = auth.uid()
);

drop policy if exists "users_profiles_delete" on public.users_profiles;
create policy "users_profiles_delete"
on public.users_profiles
for delete
to authenticated
using (
  public.is_admin()
  or (
    public.same_pharmacy(pharmacy_id)
    and exists(select 1 from public.current_profile() p where p.role = 'owner')
    and role <> 'admin'
  )
);

-- =========================
-- Generic pharmacy-scoped policies
-- Read: any authenticated user in same pharmacy OR admin
-- Write: any authenticated user in same pharmacy OR admin
-- Some tables (documents) are owner/admin write only.
-- =========================
-- CUSTOMERS
drop policy if exists "customers_select" on public.customers;
create policy "customers_select"
on public.customers for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "customers_write" on public.customers;
create policy "customers_write"
on public.customers for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- PRODUCTS
drop policy if exists "products_select" on public.products;
create policy "products_select"
on public.products for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "products_write" on public.products;
create policy "products_write"
on public.products for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- INVENTORY
drop policy if exists "inventory_select" on public.inventory;
create policy "inventory_select"
on public.inventory for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "inventory_write" on public.inventory;
create policy "inventory_write"
on public.inventory for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- STOCK_MOVEMENTS
drop policy if exists "stock_movements_select" on public.stock_movements;
create policy "stock_movements_select"
on public.stock_movements for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "stock_movements_write" on public.stock_movements;
create policy "stock_movements_write"
on public.stock_movements for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- SUPPLIERS
drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select"
on public.suppliers for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "suppliers_write" on public.suppliers;
create policy "suppliers_write"
on public.suppliers for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- SUPPLIER_CATALOGUE
drop policy if exists "supplier_catalogue_select" on public.supplier_catalogue;
create policy "supplier_catalogue_select"
on public.supplier_catalogue for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "supplier_catalogue_write" on public.supplier_catalogue;
create policy "supplier_catalogue_write"
on public.supplier_catalogue for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- PURCHASE_ORDERS
drop policy if exists "purchase_orders_select" on public.purchase_orders;
create policy "purchase_orders_select"
on public.purchase_orders for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "purchase_orders_write" on public.purchase_orders;
create policy "purchase_orders_write"
on public.purchase_orders for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- PURCHASE_ORDER_ITEMS
drop policy if exists "purchase_order_items_select" on public.purchase_order_items;
create policy "purchase_order_items_select"
on public.purchase_order_items for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "purchase_order_items_write" on public.purchase_order_items;
create policy "purchase_order_items_write"
on public.purchase_order_items for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- PURCHASES
drop policy if exists "purchases_select" on public.purchases;
create policy "purchases_select"
on public.purchases for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "purchases_write" on public.purchases;
create policy "purchases_write"
on public.purchases for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- PURCHASE_ITEMS
drop policy if exists "purchase_items_select" on public.purchase_items;
create policy "purchase_items_select"
on public.purchase_items for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "purchase_items_write" on public.purchase_items;
create policy "purchase_items_write"
on public.purchase_items for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- DOCUMENTS
drop policy if exists "documents_select" on public.documents;
create policy "documents_select"
on public.documents for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "documents_write_owner_admin" on public.documents;
create policy "documents_write_owner_admin"
on public.documents for all
to authenticated
using (
  public.is_admin()
  or (public.same_pharmacy(pharmacy_id) and exists(select 1 from public.current_profile() p where p.role in ('owner','admin')))
)
with check (
  public.is_admin()
  or (public.same_pharmacy(pharmacy_id) and exists(select 1 from public.current_profile() p where p.role in ('owner','admin')))
);

-- REMINDERS (staff can create/mark sent)
drop policy if exists "reminders_select" on public.reminders;
create policy "reminders_select"
on public.reminders for select
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id));

drop policy if exists "reminders_write" on public.reminders;
create policy "reminders_write"
on public.reminders for all
to authenticated
using (public.is_admin() or public.same_pharmacy(pharmacy_id))
with check (public.is_admin() or public.same_pharmacy(pharmacy_id));

-- =========================
-- Harden RPCs so they cannot bypass tenant boundaries
-- =========================

-- adjust_stock: force created_by = auth.uid() and check pharmacy matches profile (or admin)
create or replace function public.adjust_stock(
  p_pharmacy_id uuid,
  p_product_id uuid,
  p_delta int,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pharmacy uuid;
  v_role public.user_role;
begin
  select pharmacy_id, role into v_pharmacy, v_role
  from public.users_profiles
  where id = auth.uid();

  if v_pharmacy is null then
    raise exception 'unauthenticated';
  end if;

  if v_role <> 'admin' and v_pharmacy <> p_pharmacy_id then
    raise exception 'forbidden';
  end if;

  insert into public.stock_movements (pharmacy_id, product_id, delta, note, occurred_at, created_by)
  values (p_pharmacy_id, p_product_id, p_delta, p_note, now(), auth.uid());

  insert into public.inventory (pharmacy_id, product_id, stock, created_at, updated_at)
  values (p_pharmacy_id, p_product_id, greatest(0, p_delta), now(), now())
  on conflict (pharmacy_id, product_id)
  do update set stock = greatest(0, public.inventory.stock + excluded.stock), updated_at = now();
end;
$$;

-- record_purchase: enforce pharmacy match and actor == auth.uid() (unless admin)
create or replace function public.record_purchase(
  p_pharmacy_id uuid,
  p_customer_id uuid,
  p_method text,
  p_staff_id uuid,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_unit_price numeric;
  v_name text;
  v_pharmacy uuid;
  v_role public.user_role;
begin
  select pharmacy_id, role into v_pharmacy, v_role
  from public.users_profiles
  where id = auth.uid();

  if v_pharmacy is null then
    raise exception 'unauthenticated';
  end if;

  if v_role <> 'admin' and v_pharmacy <> p_pharmacy_id then
    raise exception 'forbidden';
  end if;

  if v_role <> 'admin' and p_staff_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'qty')::int, 1);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_total := v_total + (v_qty * v_unit_price);
  end loop;

  insert into public.purchases (pharmacy_id, customer_id, purchased_at, items_text, amount, method, staff_id, created_at)
  values (p_pharmacy_id, p_customer_id, now(), '', v_total, p_method, auth.uid(), now())
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := coalesce((v_item->>'qty')::int, 1);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_name := coalesce(v_item->>'name', 'Item');

    insert into public.purchase_items (pharmacy_id, purchase_id, product_id, name, qty, unit_price, line_total, created_at)
    values (p_pharmacy_id, v_purchase_id, v_product_id, v_name, v_qty, v_unit_price, (v_qty * v_unit_price), now());

    if v_product_id is not null then
      insert into public.stock_movements (pharmacy_id, product_id, delta, note, occurred_at, created_by)
      values (p_pharmacy_id, v_product_id, -abs(v_qty), 'sale', now(), auth.uid());

      insert into public.inventory (pharmacy_id, product_id, stock, created_at, updated_at)
      values (p_pharmacy_id, v_product_id, greatest(0, -abs(v_qty)), now(), now())
      on conflict (pharmacy_id, product_id)
      do update set stock = greatest(0, public.inventory.stock - abs(v_qty)), updated_at = now();
    end if;
  end loop;

  update public.purchases
  set items_text = (
    select string_agg(name || ' x' || qty, ', ' order by created_at)
    from public.purchase_items
    where purchase_id = v_purchase_id
  )
  where id = v_purchase_id;

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

