-- NevOut Meds (Phase 4) — Initial production schema
-- Goal: RLS-ready, multi-tenant by pharmacy_id, minimal but extensible.
-- Notes:
-- - This migration does NOT enable RLS yet (Phase 4 sets the stage).
-- - "users" table references auth.users for Supabase Auth integration.

create extension if not exists pgcrypto;

-- =========================
-- ENUMS
-- =========================
do $$ begin
  create type public.user_role as enum ('owner','staff','admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_status as enum ('active','archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.purchase_order_status as enum ('draft','sent','received','cancelled');
exception
  when duplicate_object then null;
end $$;

-- =========================
-- PHARMACIES
-- =========================
create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  city text,
  address text,
  phone text,
  whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- USERS (app profiles)
-- =========================
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  role public.user_role not null default 'staff',
  name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_pharmacy_id_idx on public.users(pharmacy_id);

-- =========================
-- SUPPLIERS + CATALOGUE
-- =========================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  name text not null,
  country text,
  city text,
  phone text,
  whatsapp text,
  email text,
  lead_days int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_pharmacy_id_idx on public.suppliers(pharmacy_id);

create table if not exists public.supplier_catalogue (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  sku text,
  product_name text not null,
  brand text,
  category text,
  unit text,
  unit_cost numeric not null,
  currency text not null default 'USD',
  moq int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_catalogue_pharmacy_id_idx on public.supplier_catalogue(pharmacy_id);
create index if not exists supplier_catalogue_supplier_id_idx on public.supplier_catalogue(supplier_id);

-- =========================
-- PRODUCTS + INVENTORY
-- =========================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  name text not null,
  brand text,
  category text not null,
  unit text,
  unit_cost numeric not null default 0,
  selling_price numeric not null default 0,
  daily_velocity numeric not null default 0,
  reorder_point int not null default 0,
  max_stock int not null default 0,
  supplier_id uuid references public.suppliers(id) on delete set null,
  is_essential boolean not null default false,
  requires_prescription boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_pharmacy_id_idx on public.products(pharmacy_id);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  stock int not null default 0,
  batch_id text,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, product_id)
);

create index if not exists inventory_pharmacy_id_idx on public.inventory(pharmacy_id);
create index if not exists inventory_product_id_idx on public.inventory(product_id);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  delta int not null,
  note text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null
);

create index if not exists stock_movements_pharmacy_id_idx on public.stock_movements(pharmacy_id);
create index if not exists stock_movements_product_id_idx on public.stock_movements(product_id);
create index if not exists stock_movements_occurred_at_idx on public.stock_movements(occurred_at desc);

-- =========================
-- CUSTOMERS + PURCHASES
-- =========================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  phone text not null,
  first_name text not null,
  last_name text not null,
  community text,
  landmark text,
  county text,
  credit_balance numeric not null default 0,
  credit_limit numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id, phone)
);

create index if not exists customers_pharmacy_id_idx on public.customers(pharmacy_id);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  purchased_at timestamptz not null default now(),
  items_text text not null,
  amount numeric not null,
  method text not null,
  staff_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists purchases_pharmacy_id_idx on public.purchases(pharmacy_id);
create index if not exists purchases_customer_id_idx on public.purchases(customer_id);
create index if not exists purchases_purchased_at_idx on public.purchases(purchased_at desc);

-- =========================
-- DOCUMENTS
-- =========================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  name text not null,
  category text not null,
  size int not null default 0,
  uploaded_at date not null default (now()::date),
  uploaded_by uuid references public.users(id) on delete set null,
  expiry_date date,
  status public.document_status not null default 'active',
  note text not null default '',
  tags text[] not null default '{}',
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_pharmacy_id_idx on public.documents(pharmacy_id);

-- =========================
-- REMINDERS
-- =========================
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete cascade,
  medicine text not null,
  due_date date not null,
  sent boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists reminders_pharmacy_id_idx on public.reminders(pharmacy_id);
create index if not exists reminders_due_date_idx on public.reminders(due_date);

-- =========================
-- PURCHASE ORDERS
-- =========================
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  status public.purchase_order_status not null default 'draft',
  ordered_at timestamptz,
  received_at timestamptz,
  currency text not null default 'USD',
  total numeric not null default 0,
  whatsapp_message text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_orders_pharmacy_id_idx on public.purchase_orders(pharmacy_id);
create index if not exists purchase_orders_supplier_id_idx on public.purchase_orders(supplier_id);

