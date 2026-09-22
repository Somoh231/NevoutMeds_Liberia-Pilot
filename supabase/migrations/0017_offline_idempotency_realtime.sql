-- Phase 5/6 — durable idempotency + realtime publication.
--
-- Offline devices replay queued writes whenever a response was not received, so
-- "exactly once" cannot depend on client memory. Every replayable mutation now
-- takes an idempotency key and records a receipt in the SAME transaction as its
-- effects:
--
--   * first call  — inserts the receipt, does the work, stores the result
--   * replay      — hits the unique index, returns the stored result unchanged
--   * concurrent  — the second transaction blocks on the unique index until the
--                   first commits, then returns that same stored result
--
-- If the first transaction rolls back, its receipt rolls back with it, so the
-- replay legitimately performs the work.

-- ===========================================================================
-- 1. Receipts
-- ===========================================================================
create table if not exists public.mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete restrict,
  user_id uuid references public.users_profiles(id) on delete set null,
  idempotency_key text not null,
  mutation_type text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  constraint mutation_receipts_key_unique unique (pharmacy_id, idempotency_key),
  constraint mutation_receipts_key_shape check (length(idempotency_key) between 8 and 128)
);

create index if not exists mutation_receipts_pharmacy_created_idx
  on public.mutation_receipts(pharmacy_id, created_at desc);

alter table public.mutation_receipts enable row level security;

drop policy if exists mutation_receipts_select on public.mutation_receipts;
create policy mutation_receipts_select on public.mutation_receipts for select to authenticated
using (pharmacy_id = (select private.pharmacy_id()));

revoke insert, update, delete on public.mutation_receipts from authenticated;
revoke all on public.mutation_receipts from anon;

-- Claims the key. Returns the previous result when this is a replay.
create or replace function private.claim_idempotency(
  p_pharmacy_id uuid, p_user uuid, p_key text, p_type text,
  out is_replay boolean, out previous_result jsonb
)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_key is null or length(p_key) < 8 then
    -- No key supplied: the caller accepts at-least-once semantics.
    is_replay := false; previous_result := null; return;
  end if;

  begin
    insert into public.mutation_receipts (pharmacy_id, user_id, idempotency_key, mutation_type)
    values (p_pharmacy_id, p_user, p_key, p_type);
    is_replay := false; previous_result := null;
  exception when unique_violation then
    select r.result into previous_result
    from public.mutation_receipts r
    where r.pharmacy_id = p_pharmacy_id and r.idempotency_key = p_key;
    is_replay := true;
  end;
end $$;

create or replace function private.store_idempotent_result(
  p_pharmacy_id uuid, p_key text, p_result jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or length(p_key) < 8 then return; end if;
  update public.mutation_receipts set result = p_result
  where pharmacy_id = p_pharmacy_id and idempotency_key = p_key;
end $$;

-- ===========================================================================
-- 2. Idempotent wrappers for the replayable mutations
--    Existing signatures stay intact, so nothing already deployed breaks.
-- ===========================================================================
create or replace function public.record_purchase_idempotent(
  p_pharmacy_id uuid,
  p_customer_id uuid,
  p_method text,
  p_staff_id uuid,
  p_items jsonb,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim record;
  v_purchase_id uuid;
begin
  select * into v_claim from private.claim_idempotency(p_pharmacy_id, auth.uid(), p_idempotency_key, 'record_purchase');
  if v_claim.is_replay then
    -- Exactly-once: hand back the purchase created by the first attempt.
    return (v_claim.previous_result ->> 'purchase_id')::uuid;
  end if;

  v_purchase_id := public.record_purchase(p_pharmacy_id, p_customer_id, p_method, p_staff_id, p_items);
  perform private.store_idempotent_result(p_pharmacy_id, p_idempotency_key,
    jsonb_build_object('purchase_id', v_purchase_id));
  return v_purchase_id;
end $$;

create or replace function public.adjust_stock_idempotent(
  p_pharmacy_id uuid,
  p_product_id uuid,
  p_delta int,
  p_note text,
  p_idempotency_key text
) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim record;
  v_stock int;
begin
  select * into v_claim from private.claim_idempotency(p_pharmacy_id, auth.uid(), p_idempotency_key, 'adjust_stock');
  if v_claim.is_replay then
    return (v_claim.previous_result ->> 'stock')::int;
  end if;

  v_stock := public.adjust_stock(p_pharmacy_id, p_product_id, p_delta, p_note);
  perform private.store_idempotent_result(p_pharmacy_id, p_idempotency_key, jsonb_build_object('stock', v_stock));
  return v_stock;
end $$;

create or replace function public.create_product_idempotent(
  p_pharmacy_id uuid,
  p_name text,
  p_category text,
  p_unit_cost numeric,
  p_selling_price numeric,
  p_stock int,
  p_idempotency_key text,
  p_brand text default null,
  p_unit text default null,
  p_reorder_point int default 0,
  p_max_stock int default 0,
  p_daily_velocity numeric default 0,
  p_batch_id text default null,
  p_expiry_date date default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_claim record; v_id uuid;
begin
  select * into v_claim from private.claim_idempotency(p_pharmacy_id, auth.uid(), p_idempotency_key, 'create_product');
  if v_claim.is_replay then
    return (v_claim.previous_result ->> 'product_id')::uuid;
  end if;

  v_id := public.create_product(p_pharmacy_id, p_name, p_category, p_unit_cost, p_selling_price, p_stock,
                                p_brand, p_unit, p_reorder_point, p_max_stock, p_daily_velocity,
                                p_batch_id, p_expiry_date, false, false);
  perform private.store_idempotent_result(p_pharmacy_id, p_idempotency_key, jsonb_build_object('product_id', v_id));
  return v_id;
end $$;

-- Customers and reminders were direct table inserts, which cannot be replayed
-- safely; they get proper RPCs so the offline queue can retry them.
create or replace function public.create_customer_idempotent(
  p_pharmacy_id uuid,
  p_phone text,
  p_first_name text,
  p_last_name text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim record;
  v_pharmacy uuid;
  v_id uuid;
  v_phone text := trim(coalesce(p_phone, ''));
begin
  v_pharmacy := private.pharmacy_id();
  if v_pharmacy is null then
    raise exception 'unauthenticated or inactive account' using errcode = '42501';
  end if;
  if v_pharmacy is distinct from p_pharmacy_id then
    raise exception 'forbidden: pharmacy mismatch' using errcode = '42501';
  end if;
  if v_phone = '' or coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'phone, first name and last name are required';
  end if;

  select * into v_claim from private.claim_idempotency(p_pharmacy_id, auth.uid(), p_idempotency_key, 'create_customer');
  if v_claim.is_replay then
    return (v_claim.previous_result ->> 'customer_id')::uuid;
  end if;

  -- A customer already on file is not an error for a replayed offline write.
  select c.id into v_id from public.customers c
  where c.pharmacy_id = p_pharmacy_id and c.phone = v_phone;

  if v_id is null then
    insert into public.customers (pharmacy_id, phone, first_name, last_name, alt_phone, alt_name,
                                  dob, gender, community, landmark, county, conditions, allergies, notes, credit_limit)
    values (p_pharmacy_id, v_phone, left(trim(p_first_name), 100), left(trim(p_last_name), 100),
            nullif(p_payload->>'alt_phone', ''), nullif(p_payload->>'alt_name', ''),
            nullif(p_payload->>'dob', '')::date, nullif(p_payload->>'gender', ''),
            nullif(p_payload->>'community', ''), nullif(p_payload->>'landmark', ''), nullif(p_payload->>'county', ''),
            coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_payload->'conditions', '[]'::jsonb)) value), '{}'),
            coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_payload->'allergies', '[]'::jsonb)) value), '{}'),
            nullif(p_payload->>'notes', ''),
            greatest(0, coalesce((p_payload->>'credit_limit')::numeric, 0)))
    returning id into v_id;
  end if;

  perform private.store_idempotent_result(p_pharmacy_id, p_idempotency_key, jsonb_build_object('customer_id', v_id));
  return v_id;
end $$;

create or replace function public.create_reminder_idempotent(
  p_pharmacy_id uuid,
  p_customer_id uuid,
  p_medicine text,
  p_due_date date,
  p_note text,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_claim record; v_pharmacy uuid; v_id uuid;
begin
  v_pharmacy := private.pharmacy_id();
  if v_pharmacy is null then
    raise exception 'unauthenticated or inactive account' using errcode = '42501';
  end if;
  if v_pharmacy is distinct from p_pharmacy_id then
    raise exception 'forbidden: pharmacy mismatch' using errcode = '42501';
  end if;
  if p_customer_id is not null
     and not exists (select 1 from public.customers c where c.id = p_customer_id and c.pharmacy_id = p_pharmacy_id) then
    raise exception 'customer does not belong to this pharmacy' using errcode = '42501';
  end if;
  if coalesce(trim(p_medicine), '') = '' or p_due_date is null then
    raise exception 'medicine and due date are required';
  end if;

  select * into v_claim from private.claim_idempotency(p_pharmacy_id, auth.uid(), p_idempotency_key, 'create_reminder');
  if v_claim.is_replay then
    return (v_claim.previous_result ->> 'reminder_id')::uuid;
  end if;

  insert into public.reminders (pharmacy_id, customer_id, medicine, due_date, note)
  values (p_pharmacy_id, p_customer_id, left(trim(p_medicine), 200), p_due_date, left(nullif(trim(p_note), ''), 500))
  returning id into v_id;

  perform private.store_idempotent_result(p_pharmacy_id, p_idempotency_key, jsonb_build_object('reminder_id', v_id));
  return v_id;
end $$;

create or replace function public.create_purchase_order_idempotent(
  p_pharmacy_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_whatsapp_message text default null,
  p_currency text default 'USD'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_claim record; v_id uuid;
begin
  select * into v_claim from private.claim_idempotency(p_pharmacy_id, auth.uid(), p_idempotency_key, 'create_purchase_order');
  if v_claim.is_replay then
    return (v_claim.previous_result ->> 'purchase_order_id')::uuid;
  end if;

  v_id := public.create_purchase_order(p_pharmacy_id, p_supplier_id, p_items, p_whatsapp_message, p_currency, 'sent');
  perform private.store_idempotent_result(p_pharmacy_id, p_idempotency_key, jsonb_build_object('purchase_order_id', v_id));
  return v_id;
end $$;

-- ===========================================================================
-- 3. Optimistic-concurrency version for product metadata
--    (inventory and purchases use transactional deltas instead, so they never
--    need last-write-wins.)
-- ===========================================================================
alter table public.products add column if not exists version int not null default 1;

create or replace function private.bump_product_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.version := coalesce(old.version, 0) + 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists products_version_bump on public.products;
create trigger products_version_bump
  before update on public.products
  for each row execute function private.bump_product_version();

-- Refuses the write when somebody else changed the product first.
create or replace function public.update_product_checked(
  p_product_id uuid,
  p_expected_version int,
  p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_pharmacy uuid := private.pharmacy_id();
  v_current public.products;
begin
  if v_pharmacy is null then
    raise exception 'unauthenticated or inactive account' using errcode = '42501';
  end if;
  select * into v_current from public.products where id = p_product_id and pharmacy_id = v_pharmacy;
  if v_current.id is null then
    raise exception 'product does not belong to this pharmacy' using errcode = '42501';
  end if;
  if p_expected_version is not null and v_current.version <> p_expected_version then
    -- Surfaced to the user as "Needs attention", never silently overwritten.
    -- PT409 makes PostgREST answer 409 Conflict. (SQLSTATE 40001 must not be
    -- used here: PostgREST treats it as a serialization failure and retries,
    -- which turns a conflict into a gateway timeout.)
    raise exception 'product was changed by someone else (version %, expected %)', v_current.version, p_expected_version
      using errcode = 'PT409';
  end if;

  update public.products set
    name = coalesce(nullif(trim(p_changes->>'name'), ''), name),
    brand = coalesce(p_changes->>'brand', brand),
    category = coalesce(nullif(trim(p_changes->>'category'), ''), category),
    unit = coalesce(p_changes->>'unit', unit),
    unit_cost = coalesce((p_changes->>'unit_cost')::numeric, unit_cost),
    selling_price = coalesce((p_changes->>'selling_price')::numeric, selling_price),
    reorder_point = coalesce((p_changes->>'reorder_point')::int, reorder_point),
    max_stock = coalesce((p_changes->>'max_stock')::int, max_stock),
    daily_velocity = coalesce((p_changes->>'daily_velocity')::numeric, daily_velocity)
  where id = p_product_id;

  select * into v_current from public.products where id = p_product_id;
  return jsonb_build_object('id', v_current.id, 'version', v_current.version);
end $$;

-- ===========================================================================
-- 4. Realtime publication — only the operational tables staff actually watch
-- ===========================================================================
do $$
declare r record;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  for r in select unnest(array['inventory','products','purchases','customers','reminders',
                               'purchase_orders','users_profiles']) as t
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = r.t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', r.t);
    end if;
  end loop;
end $$;

-- Realtime needs the old row to evaluate RLS on updates/deletes for the
-- subscriber; REPLICA IDENTITY FULL keeps tenant filtering correct.
do $$
declare r record;
begin
  for r in select unnest(array['inventory','products','purchases','customers','reminders',
                               'purchase_orders','users_profiles']) as t
  loop
    execute format('alter table public.%I replica identity full', r.t);
  end loop;
end $$;

-- ===========================================================================
-- 5. Privileges
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('record_purchase_idempotent','adjust_stock_idempotent','create_product_idempotent',
                        'create_customer_idempotent','create_reminder_idempotent',
                        'create_purchase_order_idempotent','update_product_checked')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
