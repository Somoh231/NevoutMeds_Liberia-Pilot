-- Phase 4: Suppliers/Orders/Reminders schema support for existing UI

-- Suppliers UI fields
alter table public.suppliers
  add column if not exists verified boolean not null default false,
  add column if not exists rating numeric,
  add column if not exists reviews int,
  add column if not exists on_time_rate int,
  add column if not exists min_order numeric,
  add column if not exists payment_terms text,
  add column if not exists return_policy text,
  add column if not exists delivery_zones text[] not null default '{}';

create index if not exists suppliers_verified_idx on public.suppliers(verified);

-- Supplier catalogue fields to support compare UI
alter table public.supplier_catalogue
  add column if not exists stock_status text,
  add column if not exists available_stock int;

create index if not exists supplier_catalogue_product_name_idx on public.supplier_catalogue(product_name);

-- Purchase order items (so orders can store line items)
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  qty int not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists purchase_order_items_pharmacy_id_idx on public.purchase_order_items(pharmacy_id);
create index if not exists purchase_order_items_purchase_order_id_idx on public.purchase_order_items(purchase_order_id);

