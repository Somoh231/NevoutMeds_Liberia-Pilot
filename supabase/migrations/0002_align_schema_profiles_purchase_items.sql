-- Phase 4 alignment migration
-- Aligns schema with spec:
-- - users_profiles (instead of users)
-- - purchase_items table (line items)
-- - safe atomic adjust_stock RPC for inventory adjustments

-- 1) Rename users -> users_profiles (if it exists and new table doesn't)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='users')
     and not exists (select 1 from information_schema.tables where table_schema='public' and table_name='users_profiles')
  then
    alter table public.users rename to users_profiles;
    -- rename index if it exists
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='users_pharmacy_id_idx') then
      alter index public.users_pharmacy_id_idx rename to users_profiles_pharmacy_id_idx;
    end if;
  end if;
end $$;

-- 2) Fix FKs that referenced public.users -> public.users_profiles (best-effort)
do $$ begin
  -- stock_movements.created_by
  if exists (select 1 from information_schema.table_constraints where table_schema='public' and table_name='stock_movements' and constraint_type='FOREIGN KEY') then
    -- drop any FK on created_by (name unknown) and recreate
    -- NOTE: Supabase sometimes auto-names constraints; we search by column.
    for r in
      select tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
      where tc.table_schema='public'
        and tc.table_name='stock_movements'
        and tc.constraint_type='FOREIGN KEY'
        and kcu.column_name='created_by'
    loop
      execute format('alter table public.stock_movements drop constraint %I', r.constraint_name);
    end loop;
    alter table public.stock_movements
      add constraint stock_movements_created_by_fkey
      foreign key (created_by) references public.users_profiles(id) on delete set null;
  end if;
exception when undefined_table then null;
end $$;

do $$ begin
  -- purchases.staff_id
  for r in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
    where tc.table_schema='public'
      and tc.table_name='purchases'
      and tc.constraint_type='FOREIGN KEY'
      and kcu.column_name='staff_id'
  loop
    execute format('alter table public.purchases drop constraint %I', r.constraint_name);
  end loop;

  alter table public.purchases
    add constraint purchases_staff_id_fkey
    foreign key (staff_id) references public.users_profiles(id) on delete set null;
exception when undefined_table then null;
end $$;

do $$ begin
  -- documents.uploaded_by
  for r in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
    where tc.table_schema='public'
      and tc.table_name='documents'
      and tc.constraint_type='FOREIGN KEY'
      and kcu.column_name='uploaded_by'
  loop
    execute format('alter table public.documents drop constraint %I', r.constraint_name);
  end loop;
  alter table public.documents
    add constraint documents_uploaded_by_fkey
    foreign key (uploaded_by) references public.users_profiles(id) on delete set null;
exception when undefined_table then null;
end $$;

do $$ begin
  -- purchase_orders.created_by
  for r in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
    where tc.table_schema='public'
      and tc.table_name='purchase_orders'
      and tc.constraint_type='FOREIGN KEY'
      and kcu.column_name='created_by'
  loop
    execute format('alter table public.purchase_orders drop constraint %I', r.constraint_name);
  end loop;
  alter table public.purchase_orders
    add constraint purchase_orders_created_by_fkey
    foreign key (created_by) references public.users_profiles(id) on delete set null;
exception when undefined_table then null;
end $$;

-- 3) purchase_items table
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  qty int not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists purchase_items_pharmacy_id_idx on public.purchase_items(pharmacy_id);
create index if not exists purchase_items_purchase_id_idx on public.purchase_items(purchase_id);
create index if not exists purchase_items_product_id_idx on public.purchase_items(product_id);

-- 4) Atomic inventory adjustment RPC
-- Adjusts inventory stock and records a movement in one transaction.
create or replace function public.adjust_stock(
  p_pharmacy_id uuid,
  p_product_id uuid,
  p_delta int,
  p_note text default null
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.stock_movements (pharmacy_id, product_id, delta, note, occurred_at)
  values (p_pharmacy_id, p_product_id, p_delta, p_note, now());

  insert into public.inventory (pharmacy_id, product_id, stock, created_at, updated_at)
  values (p_pharmacy_id, p_product_id, greatest(0, p_delta), now(), now())
  on conflict (pharmacy_id, product_id)
  do update set stock = greatest(0, public.inventory.stock + excluded.stock), updated_at = now();
end;
$$;

