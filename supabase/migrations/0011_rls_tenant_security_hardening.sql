-- Phase 2 — Critical RLS / tenant security hardening.
--
-- Fixes, in order:
--  1. Recursive RLS helpers. `public.current_profile()` was SECURITY INVOKER and
--     read `users_profiles`, whose own policies called it again: every
--     authenticated query on a tenant table died with "stack depth limit
--     exceeded". Helpers now live in a private schema, are SECURITY DEFINER
--     with a pinned search_path, and so read the table without re-entering RLS.
--  2. Privilege escalation. Staff could update their own row freely, including
--     `role` and `pharmacy_id`. Role/tenant columns are now unwritable through
--     the API (column grants + a trigger guard); provisioning happens only in
--     SECURITY DEFINER workflows.
--  3. Cross-tenant relationships. Composite foreign keys make a row physically
--     unable to point at another pharmacy's record.
--  4. Unvalidated RPCs. adjust_stock/record_purchase now verify tenant
--     ownership of every referenced row and reject impossible values.
--  5. anon exposure. Supabase's default privileges gave `anon` EXECUTE on every
--     public function and full table grants; both are revoked here.

-- ===========================================================================
-- 1. Private, non-recursive RLS helpers
-- ===========================================================================
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- SECURITY DEFINER + owner (postgres) => reads users_profiles without invoking
-- its policies, so nothing can recurse. search_path is pinned to ''.
create or replace function private.current_profile()
returns table (user_id uuid, pharmacy_id uuid, role public.user_role)
language sql
stable
security definer
set search_path = ''
as $$
  select up.id, up.pharmacy_id, up.role
  from public.users_profiles up
  where up.id = auth.uid()
$$;

create or replace function private.pharmacy_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select up.pharmacy_id from public.users_profiles up where up.id = auth.uid()
$$;

create or replace function private.user_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select up.role from public.users_profiles up where up.id = auth.uid()
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users_profiles up where up.id = auth.uid() and up.role = 'admin')
$$;

create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users_profiles up where up.id = auth.uid() and up.role in ('owner','admin'))
$$;

-- Member of this specific pharmacy (the tenant predicate used by every policy).
create or replace function private.is_member_of(p_pharmacy_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_pharmacy_id is not null
     and exists (select 1 from public.users_profiles up
                 where up.id = auth.uid() and up.pharmacy_id = p_pharmacy_id)
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- Backwards-compatible public wrappers (no longer touch users_profiles directly).
create or replace function public.current_profile()
returns table (user_id uuid, pharmacy_id uuid, role public.user_role)
language sql stable security invoker set search_path = '' as $$
  select * from private.current_profile()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_admin()
$$;

create or replace function public.same_pharmacy(p_pharmacy_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_member_of(p_pharmacy_id)
$$;

-- ===========================================================================
-- 2. Tenant integrity: composite foreign keys
-- ===========================================================================
-- Parent keys that make (pharmacy_id, id) referenceable.
do $$
declare r record;
begin
  for r in select unnest(array['customers','products','suppliers','purchases','purchase_orders','users_profiles']) as t
  loop
    if not exists (select 1 from pg_constraint where conname = r.t || '_pharmacy_id_id_key') then
      execute format('alter table public.%I add constraint %I unique (pharmacy_id, id)', r.t, r.t || '_pharmacy_id_id_key');
    end if;
  end loop;
end $$;

-- Replace single-column FKs with tenant-aware composite ones.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('purchases',            'purchases_customer_id_fkey',            'purchases_pharmacy_customer_fkey',            'customer_id',       'customers',       'cascade'),
      ('purchase_items',       'purchase_items_purchase_id_fkey',       'purchase_items_pharmacy_purchase_fkey',       'purchase_id',       'purchases',       'cascade'),
      ('purchase_items',       'purchase_items_product_id_fkey',        'purchase_items_pharmacy_product_fkey',        'product_id',        'products',        'set null'),
      ('inventory',            'inventory_product_id_fkey',             'inventory_pharmacy_product_fkey',             'product_id',        'products',        'cascade'),
      ('stock_movements',      'stock_movements_product_id_fkey',       'stock_movements_pharmacy_product_fkey',       'product_id',        'products',        'cascade'),
      ('reminders',            'reminders_customer_id_fkey',            'reminders_pharmacy_customer_fkey',            'customer_id',       'customers',       'cascade'),
      ('purchase_orders',      'purchase_orders_supplier_id_fkey',      'purchase_orders_pharmacy_supplier_fkey',      'supplier_id',       'suppliers',       'restrict'),
      ('purchase_order_items', 'purchase_order_items_purchase_order_id_fkey', 'purchase_order_items_pharmacy_po_fkey', 'purchase_order_id', 'purchase_orders', 'cascade'),
      ('purchase_order_items', 'purchase_order_items_product_id_fkey',  'purchase_order_items_pharmacy_product_fkey',  'product_id',        'products',        'set null'),
      ('supplier_catalogue',   'supplier_catalogue_supplier_id_fkey',   'supplier_catalogue_pharmacy_supplier_fkey',   'supplier_id',       'suppliers',       'cascade'),
      ('products',             'products_supplier_id_fkey',             'products_pharmacy_supplier_fkey',             'supplier_id',       'suppliers',       'set null'),
      ('app_events',           'app_events_user_id_fkey',               'app_events_pharmacy_user_fkey',               'user_id',           'users_profiles',  'cascade'),
      ('app_feedback',         'app_feedback_user_id_fkey',             'app_feedback_pharmacy_user_fkey',             'user_id',           'users_profiles',  'set null')
    ) as t(tbl, old_fk, new_fk, col, parent, on_delete)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.old_fk);
    if not exists (select 1 from pg_constraint where conname = r.new_fk) then
      execute format(
        'alter table public.%I add constraint %I foreign key (pharmacy_id, %I) references public.%I (pharmacy_id, id) on delete %s',
        r.tbl, r.new_fk, r.col, r.parent,
        -- SET NULL must only clear the child column: pharmacy_id is NOT NULL.
        case when r.on_delete = 'set null' then format('set null (%I)', r.col) else r.on_delete end);
    end if;
  end loop;
end $$;

-- ===========================================================================
-- 3. Value validation (CHECK constraints)
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select * from (values
      ('inventory',            'inventory_stock_non_negative',        'stock >= 0'),
      ('products',             'products_costs_non_negative',         'unit_cost >= 0 and selling_price >= 0 and reorder_point >= 0 and max_stock >= 0 and daily_velocity >= 0'),
      ('purchase_items',       'purchase_items_valid_amounts',        'qty > 0 and unit_price >= 0 and line_total >= 0'),
      ('purchase_order_items', 'purchase_order_items_valid_amounts',  'qty > 0 and unit_price >= 0 and line_total >= 0'),
      ('purchases',            'purchases_amount_non_negative',       'amount >= 0'),
      ('purchases',            'purchases_method_allowed',            $c$method in ('Cash','Mobile Money','Credit','Diaspora Pay','Insurance')$c$),
      ('customers',            'customers_credit_non_negative',       'credit_limit >= 0'),
      ('supplier_catalogue',   'supplier_catalogue_cost_non_negative','unit_cost >= 0'),
      ('stock_movements',      'stock_movements_delta_non_zero',      'delta <> 0'),
      ('app_feedback',         'app_feedback_rating_range',           'rating is null or (rating between 1 and 5)')
    ) as t(tbl, name, expr)
  loop
    if not exists (select 1 from pg_constraint where conname = r.name) then
      execute format('alter table public.%I add constraint %I check (%s)', r.tbl, r.name, r.expr);
    end if;
  end loop;
end $$;

-- ===========================================================================
-- 4. Privileges: anon gets nothing; writes that must go through RPCs are revoked
-- ===========================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Ledger tables are written only by the hardened RPCs.
revoke insert, update, delete on public.purchases       from authenticated;
revoke insert, update, delete on public.purchase_items  from authenticated;
revoke insert, update, delete on public.stock_movements from authenticated;
revoke insert, update, delete on public.inventory       from authenticated;
-- Non-quantitative inventory attributes stay directly editable.
grant update (batch_id, expiry_date, updated_at) on public.inventory to authenticated;

-- Profiles: nobody may insert/delete through the API, and a user may only
-- maintain their own display name and activity stamps.
revoke insert, update, delete on public.users_profiles from authenticated;
grant update (name, email, last_login_at, last_seen_at) on public.users_profiles to authenticated;

-- ===========================================================================
-- 5. Trigger guard: role / tenant reassignment can never come from the API
-- ===========================================================================
create or replace function private.guard_profile_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- SECURITY DEFINER provisioning runs as the table owner, not as an API role.
  if current_user in ('authenticated', 'anon') then
    if new.role is distinct from old.role
       or new.pharmacy_id is distinct from old.pharmacy_id
       or new.id is distinct from old.id then
      raise exception 'role and pharmacy assignment can only be changed by a privileged workflow'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists users_profiles_guard_mutation on public.users_profiles;
create trigger users_profiles_guard_mutation
  before update on public.users_profiles
  for each row execute function private.guard_profile_mutation();

-- ===========================================================================
-- 6. Policies, rebuilt on the private helpers
--    Read: own pharmacy, or admin (support read-only across tenants).
--    Write: own pharmacy only — including for admins.
-- ===========================================================================
do $$
declare r record; p record;
begin
  for r in select unnest(array[
      'customers','products','inventory','stock_movements','suppliers','supplier_catalogue',
      'purchase_orders','purchase_order_items','purchases','purchase_items','documents','reminders'
    ]) as t
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = r.t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, r.t);
    end loop;

    execute format($f$
      create policy %I on public.%I for select to authenticated
      using ((select private.is_admin()) or pharmacy_id = (select private.pharmacy_id()))
    $f$, r.t || '_select', r.t);
  end loop;
end $$;

-- Write policies for the tables clients may write directly.
do $$
declare r record;
begin
  for r in select unnest(array['customers','products','suppliers','supplier_catalogue',
                               'purchase_orders','purchase_order_items','reminders']) as t
  loop
    execute format($f$
      create policy %I on public.%I for insert to authenticated
      with check (pharmacy_id = (select private.pharmacy_id()))
    $f$, r.t || '_insert', r.t);
    execute format($f$
      create policy %I on public.%I for update to authenticated
      using (pharmacy_id = (select private.pharmacy_id()))
      with check (pharmacy_id = (select private.pharmacy_id()))
    $f$, r.t || '_update', r.t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (pharmacy_id = (select private.pharmacy_id()))
    $f$, r.t || '_delete', r.t);
  end loop;
end $$;

-- Attribution cannot be forged: a row records the user who actually wrote it.
drop policy if exists purchase_orders_insert on public.purchase_orders;
create policy purchase_orders_insert on public.purchase_orders for insert to authenticated
  with check (pharmacy_id = (select private.pharmacy_id()) and (created_by is null or created_by = auth.uid()));

-- Inventory: attribute-only updates (stock is column-revoked above).
create policy inventory_update on public.inventory for update to authenticated
  using (pharmacy_id = (select private.pharmacy_id()))
  with check (pharmacy_id = (select private.pharmacy_id()));

-- Documents are owner/admin-managed within the pharmacy.
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    pharmacy_id = (select private.pharmacy_id())
    and (select private.is_owner())
    and (uploaded_by is null or uploaded_by = auth.uid())
  );
create policy documents_update on public.documents for update to authenticated
  using (pharmacy_id = (select private.pharmacy_id()) and (select private.is_owner()))
  with check (pharmacy_id = (select private.pharmacy_id()) and (select private.is_owner()));
create policy documents_delete on public.documents for delete to authenticated
  using (pharmacy_id = (select private.pharmacy_id()) and (select private.is_owner()));

-- USERS_PROFILES
drop policy if exists "users_profiles_select" on public.users_profiles;
drop policy if exists "users_profiles_insert" on public.users_profiles;
drop policy if exists "users_profiles_update" on public.users_profiles;
drop policy if exists "users_profiles_delete" on public.users_profiles;

create policy users_profiles_select on public.users_profiles for select to authenticated
using (
  id = auth.uid()
  or (select private.is_admin())
  or (pharmacy_id = (select private.pharmacy_id()) and (select private.user_role()) = 'owner')
);

-- Self-service updates only; columns are restricted by the grants above and the
-- trigger guard. No insert/delete policy exists: provisioning is RPC-only.
create policy users_profiles_update_self on public.users_profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- PHARMACIES
drop policy if exists "pharmacies_select" on public.pharmacies;
create policy pharmacies_select on public.pharmacies for select to authenticated
using ((select private.is_admin()) or id = (select private.pharmacy_id()));

-- TELEMETRY
drop policy if exists "app_events_select" on public.app_events;
drop policy if exists "app_events_insert" on public.app_events;
drop policy if exists "app_feedback_select" on public.app_feedback;
drop policy if exists "app_feedback_insert" on public.app_feedback;
drop policy if exists "app_logs_select" on public.app_logs;
drop policy if exists "app_logs_insert" on public.app_logs;

create policy app_events_select on public.app_events for select to authenticated
using ((select private.is_admin()) or pharmacy_id = (select private.pharmacy_id()));
create policy app_events_insert on public.app_events for insert to authenticated
with check (pharmacy_id = (select private.pharmacy_id()) and user_id = auth.uid());

create policy app_feedback_select on public.app_feedback for select to authenticated
using ((select private.is_admin()) or pharmacy_id = (select private.pharmacy_id()));
create policy app_feedback_insert on public.app_feedback for insert to authenticated
with check (pharmacy_id = (select private.pharmacy_id()) and user_id = auth.uid());

create policy app_logs_select on public.app_logs for select to authenticated
using ((select private.is_admin()) or (pharmacy_id is not null and pharmacy_id = (select private.pharmacy_id())));
create policy app_logs_insert on public.app_logs for insert to authenticated
with check (
  (pharmacy_id is null or pharmacy_id = (select private.pharmacy_id()))
  and (user_id is null or user_id = auth.uid())
);

-- ===========================================================================
-- 7. Hardened RPCs
-- ===========================================================================

-- adjust_stock -------------------------------------------------------------
drop function if exists public.adjust_stock(uuid, uuid, int, text);
create function public.adjust_stock(
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
  select up.pharmacy_id into v_pharmacy from public.users_profiles up where up.id = auth.uid();
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

-- record_purchase ----------------------------------------------------------
drop function if exists public.record_purchase(uuid, uuid, text, uuid, jsonb);
create function public.record_purchase(
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
  select up.pharmacy_id into v_pharmacy from public.users_profiles up where up.id = auth.uid();
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

-- create_product: atomic product + opening stock ---------------------------
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
  select up.pharmacy_id into v_pharmacy from public.users_profiles up where up.id = auth.uid();
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

-- import_inventory_levels: atomic bulk stock import with a per-row report ---
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
  select up.pharmacy_id into v_pharmacy from public.users_profiles up where up.id = auth.uid();
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

-- onboard_new_pharmacy -----------------------------------------------------
create or replace function public.onboard_new_pharmacy(
  p_pharmacy_name text,
  p_country text default null,
  p_city text default null,
  p_address text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_owner_name text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_pharmacy_id uuid;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- An existing member can never create or hop into another pharmacy.
  select up.pharmacy_id into v_existing from public.users_profiles up where up.id = v_user;
  if v_existing is not null then
    return v_existing;
  end if;
  if coalesce(trim(p_pharmacy_name), '') = '' then
    raise exception 'pharmacy name is required';
  end if;

  insert into public.pharmacies (name, country, city, address, phone, whatsapp)
  values (left(trim(p_pharmacy_name), 200), p_country, p_city, p_address, p_phone, p_whatsapp)
  returning id into v_pharmacy_id;

  insert into public.users_profiles (id, pharmacy_id, role, name, email)
  values (v_user, v_pharmacy_id, 'owner', left(coalesce(nullif(trim(p_owner_name), ''), 'Owner'), 200),
          (select u.email from auth.users u where u.id = v_user));

  return v_pharmacy_id;
end $$;

-- Admin RPCs: fail closed instead of returning empty results ---------------
create or replace function public.admin_pilot_overview()
returns table (
  pharmacy_id uuid,
  pharmacy_name text,
  users_count int,
  last_seen_at timestamptz,
  last_purchase_at timestamptz,
  last_stock_movement_at timestamptz,
  errors_24h int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;
  return query
    select ph.id, ph.name, coalesce(u.cnt, 0)::int, u.last_seen_at, p.last_purchase_at,
           sm.last_stock_movement_at, coalesce(e.err_24h, 0)::int
    from public.pharmacies ph
    left join (select up.pharmacy_id, count(*) cnt, max(up.last_seen_at) last_seen_at
               from public.users_profiles up group by up.pharmacy_id) u on u.pharmacy_id = ph.id
    left join (select pu.pharmacy_id, max(pu.purchased_at) last_purchase_at
               from public.purchases pu group by pu.pharmacy_id) p on p.pharmacy_id = ph.id
    left join (select s.pharmacy_id, max(s.occurred_at) last_stock_movement_at
               from public.stock_movements s group by s.pharmacy_id) sm on sm.pharmacy_id = ph.id
    left join (select l.pharmacy_id, count(*) filter (where l.created_at > now() - interval '24 hours') err_24h
               from public.app_logs l group by l.pharmacy_id) e on e.pharmacy_id = ph.id
    order by ph.created_at desc;
end $$;

-- ===========================================================================
-- 8. Function privileges: authenticated only, never anon
-- ===========================================================================
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;
