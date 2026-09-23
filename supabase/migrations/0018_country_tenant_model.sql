-- NevOut Meds — Phase 9: country, currency and timezone tenant model.
--
-- What this migration does:
--   1. A server-side country registry (private.country_rules). The server is
--      the authority for which currencies, timezones, locales and payment
--      methods a country allows; the client mirrors it for display only.
--   2. Pharmacies gain country_code, default_currency, timezone, locale,
--      payment_methods, address_fields and regulatory. Every existing
--      pharmacy is backfilled to Liberia / USD / Africa/Monrovia / en-LR —
--      exactly how the app has always behaved (all money shown as "$").
--   3. Country and currency lock once a pharmacy has recorded sales, and
--      every configuration change is written to pharmacy_config_changes.
--   4. Money records are stamped with their currency at write time and never
--      converted afterwards (purchases.currency_code, supplier_catalogue,
--      purchase_orders).
--   5. Business dates follow the pharmacy's timezone, resolved on the server
--      from the pharmacy row — never from a client-supplied value.
--   6. New RPCs: onboard_pharmacy(jsonb) and update_pharmacy_settings(jsonb).
--
-- Liberia keeps working exactly: Africa/Monrovia is UTC+0 with no DST, USD
-- stays the operating currency and the five existing payment methods stay
-- enabled.

-- ===========================================================================
-- 1. Country registry
-- ===========================================================================
create table if not exists private.country_rules (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currencies text[] not null,               -- [1] is the default operating currency
  timezones text[] not null,                -- [1] is the default
  locales text[] not null,                  -- [1] is the default
  payment_methods text[] not null,          -- methods a pharmacy may enable
  default_payment_methods text[] not null,  -- enabled when the owner hasn't chosen
  check (cardinality(currencies) > 0 and cardinality(timezones) > 0 and cardinality(locales) > 0),
  check (default_payment_methods <@ payment_methods)
);

-- Only the facts needed to run the app. Tax rates and regulatory numbers are
-- deliberately absent (see docs/country/REGULATORY_RESEARCH_BACKLOG.md).
insert into private.country_rules (code, name, currencies, timezones, locales, payment_methods, default_payment_methods) values
  ('LR', 'Liberia',      array['USD','LRD'], array['Africa/Monrovia'], array['en-LR'],
     array['Cash','Mobile Money','Credit','Diaspora Pay','Insurance','Card','Bank Transfer'],
     array['Cash','Mobile Money','Credit','Diaspora Pay','Insurance']),
  ('SL', 'Sierra Leone', array['SLE'], array['Africa/Freetown'], array['en-SL'],
     array['Cash','Mobile Money','Credit','Insurance','Card','Bank Transfer'],
     array['Cash','Mobile Money','Credit']),
  ('GH', 'Ghana',        array['GHS'], array['Africa/Accra'], array['en-GH'],
     array['Cash','Mobile Money','Credit','Insurance','Card','Bank Transfer'],
     array['Cash','Mobile Money','Credit']),
  ('NG', 'Nigeria',      array['NGN'], array['Africa/Lagos'], array['en-NG'],
     array['Cash','Mobile Money','Credit','Insurance','Card','Bank Transfer'],
     array['Cash','Credit','Card','Bank Transfer']),
  ('GM', 'The Gambia',   array['GMD'], array['Africa/Banjul'], array['en-GM'],
     array['Cash','Mobile Money','Credit','Insurance','Card','Bank Transfer'],
     array['Cash','Mobile Money','Credit']),
  ('KE', 'Kenya',        array['KES'], array['Africa/Nairobi'], array['en-KE', 'sw-KE'],
     array['Cash','Mobile Money','Credit','Insurance','Card','Bank Transfer'],
     array['Cash','Mobile Money','Credit']),
  ('RW', 'Rwanda',       array['RWF'], array['Africa/Kigali'], array['en-RW', 'fr-RW', 'rw-RW'],
     array['Cash','Mobile Money','Credit','Insurance','Card','Bank Transfer'],
     array['Cash','Mobile Money','Credit'])
on conflict (code) do update set
  name = excluded.name, currencies = excluded.currencies, timezones = excluded.timezones,
  locales = excluded.locales, payment_methods = excluded.payment_methods,
  default_payment_methods = excluded.default_payment_methods;

revoke all on private.country_rules from public, anon, authenticated;

-- Maps legacy free-text country values ("Liberia", "ghana", "GH") to a code.
create or replace function private.country_code_for(p_country text)
returns text language sql stable security definer set search_path = '' as $$
  select r.code from private.country_rules r
  where upper(trim(coalesce(p_country, ''))) in (r.code, upper(r.name), upper(replace(r.name, 'The ', '')))
  limit 1
$$;

-- Currencies a supplier price or purchase order may be recorded in: the
-- country's own currencies plus USD, which regional wholesalers quote in.
create or replace function private.allowed_trade_currencies(p_country text)
returns text[] language sql stable security definer set search_path = '' as $$
  select array(select distinct c from unnest(r.currencies || array['USD']) c)
  from private.country_rules r where r.code = p_country
$$;

-- ===========================================================================
-- 2. Pharmacy configuration columns (backfilled to Liberia defaults)
-- ===========================================================================
alter table public.pharmacies
  add column if not exists country_code text,
  add column if not exists default_currency text,
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists payment_methods text[],
  add column if not exists address_fields jsonb not null default '{}'::jsonb,
  add column if not exists regulatory jsonb not null default '{}'::jsonb;

-- Every existing pharmacy is a Liberia pilot, and every amount it recorded was
-- shown as "$" (USD). Recorded history is labelled with what it always meant.
update public.pharmacies
   set country = coalesce(nullif(trim(country), ''), 'Liberia'),
       country_code = coalesce(country_code, 'LR'),
       default_currency = coalesce(default_currency, 'USD'),
       timezone = coalesce(timezone, 'Africa/Monrovia'),
       locale = coalesce(locale, 'en-LR')
 where country_code is null or default_currency is null or timezone is null or locale is null;

alter table public.pharmacies
  alter column country_code set default 'LR',
  alter column country_code set not null,
  alter column default_currency set not null,
  alter column timezone set not null,
  alter column locale set not null;

alter table public.pharmacies drop constraint if exists pharmacies_address_fields_object;
alter table public.pharmacies add constraint pharmacies_address_fields_object
  check (jsonb_typeof(address_fields) = 'object' and pg_column_size(address_fields) < 4096);
alter table public.pharmacies drop constraint if exists pharmacies_regulatory_object;
alter table public.pharmacies add constraint pharmacies_regulatory_object
  check (jsonb_typeof(regulatory) = 'object' and pg_column_size(regulatory) < 8192);

-- Audit trail for configuration changes (who, what, when).
create table if not exists public.pharmacy_config_changes (
  id bigint generated always as identity primary key,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  changed_by uuid,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default now()
);
create index if not exists pharmacy_config_changes_pharmacy_idx
  on public.pharmacy_config_changes (pharmacy_id, changed_at desc);

alter table public.pharmacy_config_changes enable row level security;
drop policy if exists pharmacy_config_changes_select on public.pharmacy_config_changes;
create policy pharmacy_config_changes_select on public.pharmacy_config_changes for select to authenticated
  using ((select private.is_admin()) or (pharmacy_id = (select private.pharmacy_id()) and (select private.is_owner())));
revoke all on public.pharmacy_config_changes from anon, authenticated;
grant select on public.pharmacy_config_changes to authenticated;

-- Validates and completes a pharmacy's configuration against the registry.
create or replace function private.validate_pharmacy_config()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r private.country_rules;
  v_has_sales boolean;
  v_override boolean;
begin
  new.country_code := upper(trim(new.country_code));
  select * into r from private.country_rules where code = new.country_code;
  if not found then
    raise exception 'unsupported country: %', new.country_code using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and new.country_code is distinct from old.country_code and new.default_currency is not distinct from old.default_currency
     and not (old.default_currency = any(r.currencies)) then
    -- Switching country without choosing a currency: take the new default.
    new.default_currency := null;
  end if;
  if tg_op = 'UPDATE' and new.country_code is distinct from old.country_code then
    if new.timezone is not distinct from old.timezone and not (old.timezone = any(r.timezones)) then new.timezone := null; end if;
    if new.locale is not distinct from old.locale and not (old.locale = any(r.locales)) then new.locale := null; end if;
    if new.payment_methods is not distinct from old.payment_methods then new.payment_methods := null; end if;
  end if;

  new.default_currency := coalesce(upper(trim(new.default_currency)), r.currencies[1]);
  new.timezone := coalesce(nullif(trim(new.timezone), ''), r.timezones[1]);
  new.locale := coalesce(nullif(trim(new.locale), ''), r.locales[1]);
  new.country := r.name;  -- keep the legacy display column in step

  if not (new.default_currency = any(r.currencies)) then
    raise exception 'currency % is not supported for %', new.default_currency, r.name using errcode = '22023';
  end if;
  if not (new.timezone = any(r.timezones)) then
    raise exception 'timezone % is not supported for %', new.timezone, r.name using errcode = '22023';
  end if;
  if not (new.locale = any(r.locales)) then
    raise exception 'locale % is not supported for %', new.locale, r.name using errcode = '22023';
  end if;
  if new.payment_methods is not null then
    if cardinality(new.payment_methods) = 0 then
      raise exception 'at least one payment method must be enabled' using errcode = '22023';
    end if;
    if not (new.payment_methods <@ r.payment_methods) then
      raise exception 'payment method not available in %', r.name using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and (new.country_code is distinct from old.country_code or new.default_currency is distinct from old.default_currency) then
    select exists (select 1 from public.purchases p where p.pharmacy_id = new.id) into v_has_sales;
    -- Operators may correct a mis-onboarded pharmacy from a direct database
    -- session (no API request claims) by setting nevout.country_change_override.
    v_override := coalesce(current_setting('nevout.country_change_override', true), '') = 'on'
                  and coalesce(current_setting('request.jwt.claims', true), '') in ('', '{}');
    if v_has_sales and not v_override then
      raise exception 'country and currency are locked: this pharmacy has recorded sales'
        using errcode = '55000',
              hint = 'Recorded amounts keep the currency they were entered in. Contact support to correct a mis-configured pharmacy.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    insert into public.pharmacy_config_changes (pharmacy_id, changed_by, field, old_value, new_value)
    select new.id, auth.uid(), f.field, f.o, f.n
    from (values
      ('country_code', to_jsonb(old.country_code), to_jsonb(new.country_code)),
      ('default_currency', to_jsonb(old.default_currency), to_jsonb(new.default_currency)),
      ('timezone', to_jsonb(old.timezone), to_jsonb(new.timezone)),
      ('locale', to_jsonb(old.locale), to_jsonb(new.locale)),
      ('payment_methods', to_jsonb(old.payment_methods), to_jsonb(new.payment_methods)),
      ('address_fields', old.address_fields, new.address_fields),
      ('regulatory', old.regulatory, new.regulatory)
    ) f(field, o, n)
    where f.o is distinct from f.n;
  end if;
  return new;
end $$;

drop trigger if exists pharmacies_validate_config on public.pharmacies;
create trigger pharmacies_validate_config
  before insert or update on public.pharmacies
  for each row execute function private.validate_pharmacy_config();

-- The new configuration columns are only written through
-- update_pharmacy_settings (validated, owner-only). The existing column grant
-- for contact details is kept as-is.
revoke update on public.pharmacies from authenticated;
grant update (name, city, address, phone, whatsapp, updated_at) on public.pharmacies to authenticated;

-- Helpers the RPCs use. Resolved from the pharmacy row, never from the client.
create or replace function private.pharmacy_timezone(p_pharmacy uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select ph.timezone from public.pharmacies ph where ph.id = p_pharmacy), 'UTC')
$$;

create or replace function private.pharmacy_currency(p_pharmacy uuid)
returns text language sql stable security definer set search_path = '' as $$
  select ph.default_currency from public.pharmacies ph where ph.id = p_pharmacy
$$;

create or replace function private.pharmacy_payment_methods(p_pharmacy uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(ph.payment_methods, r.default_payment_methods)
  from public.pharmacies ph join private.country_rules r on r.code = ph.country_code
  where ph.id = p_pharmacy
$$;

-- The pharmacy's business date "today", in its own timezone.
create or replace function private.business_date(p_pharmacy uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone private.pharmacy_timezone(p_pharmacy))::date
$$;

-- The table-level vocabulary of payment methods (0011 allowed only the five
-- Liberian ones). Which of these a pharmacy may use is enforced per country
-- and per pharmacy in record_purchase; this constraint only keeps the column
-- to known values.
alter table public.purchases drop constraint if exists purchases_method_allowed;
alter table public.purchases add constraint purchases_method_allowed
  check (method in ('Cash','Mobile Money','Credit','Diaspora Pay','Insurance','Card','Bank Transfer'));

-- ===========================================================================
-- 3. Currency stamping — every money record carries its currency
-- ===========================================================================
alter table public.purchases add column if not exists currency_code text;
update public.purchases p
   set currency_code = ph.default_currency
  from public.pharmacies ph
 where ph.id = p.pharmacy_id and p.currency_code is null;
alter table public.purchases alter column currency_code set not null;
alter table public.purchases drop constraint if exists purchases_currency_code_format;
alter table public.purchases add constraint purchases_currency_code_format check (currency_code ~ '^[A-Z]{3}$');

create or replace function private.stamp_purchase_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.currency_code := coalesce(new.currency_code, private.pharmacy_currency(new.pharmacy_id));
  elsif new.currency_code is distinct from old.currency_code then
    -- A recorded sale is never re-labelled or converted.
    raise exception 'the currency of a recorded sale cannot be changed' using errcode = '55000';
  end if;
  return new;
end $$;

drop trigger if exists purchases_stamp_currency on public.purchases;
create trigger purchases_stamp_currency
  before insert or update of currency_code on public.purchases
  for each row execute function private.stamp_purchase_currency();

-- Supplier prices and purchase orders: default to the pharmacy's currency
-- instead of a hard-coded USD, and only accept currencies that make sense.
alter table public.supplier_catalogue alter column currency drop default;
alter table public.purchase_orders alter column currency drop default;

create or replace function private.stamp_trade_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_country text;
begin
  select ph.country_code into v_country from public.pharmacies ph where ph.id = new.pharmacy_id;
  new.currency := upper(coalesce(nullif(trim(new.currency), ''), private.pharmacy_currency(new.pharmacy_id)));
  -- (Nested so `old.status` is only read on purchase_orders updates.)
  if tg_op = 'UPDATE' and tg_table_name = 'purchase_orders' then
    if new.currency is distinct from old.currency and (to_jsonb(old)->>'status') <> 'draft' then
      raise exception 'the currency of a placed order cannot be changed' using errcode = '55000';
    end if;
  end if;
  if not (new.currency = any(private.allowed_trade_currencies(v_country))) then
    raise exception 'currency % is not accepted for this pharmacy', new.currency using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists supplier_catalogue_stamp_currency on public.supplier_catalogue;
create trigger supplier_catalogue_stamp_currency
  before insert or update of currency on public.supplier_catalogue
  for each row execute function private.stamp_trade_currency();

drop trigger if exists purchase_orders_stamp_currency on public.purchase_orders;
create trigger purchase_orders_stamp_currency
  before insert or update of currency on public.purchase_orders
  for each row execute function private.stamp_trade_currency();

-- Customer registration date: the pharmacy's local date, not UTC.
alter table public.customers alter column registered_at drop default;
alter table public.customers alter column last_visit drop default;

create or replace function private.customer_local_dates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.registered_at := coalesce(new.registered_at, private.business_date(new.pharmacy_id));
  new.last_visit := coalesce(new.last_visit, private.business_date(new.pharmacy_id));
  return new;
end $$;

drop trigger if exists customers_local_dates on public.customers;
create trigger customers_local_dates
  before insert on public.customers
  for each row execute function private.customer_local_dates();

-- ===========================================================================
-- 4. RPCs: record_purchase (payment methods + local last_visit)
-- ===========================================================================
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
  -- Enabled methods come from the pharmacy (or its country's defaults).
  if p_method is null or not (p_method = any(private.pharmacy_payment_methods(p_pharmacy_id))) then
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
    -- Upper bound sized for low-denomination currencies (RWF, NGN, SLE).
    if v_unit_price < 0 or v_unit_price > 100000000 then
      raise exception 'invalid unit price: %', v_unit_price;
    end if;
    if v_product_id is not null
       and not exists (select 1 from public.products pr where pr.id = v_product_id and pr.pharmacy_id = p_pharmacy_id) then
      raise exception 'product does not belong to this pharmacy' using errcode = '42501';
    end if;
    v_total := v_total + (v_qty * v_unit_price);
  end loop;

  -- currency_code is stamped from the pharmacy by trigger.
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
         last_visit = private.business_date(p_pharmacy_id),
         credit_balance = case when p_method = 'Credit' then credit_balance + v_total else credit_balance end,
         updated_at = now()
   where id = p_customer_id and pharmacy_id = p_pharmacy_id;

  return v_purchase_id;
end $$;

-- The idempotent wrapper gains p_currency: the currency the device priced the
-- sale in. A sale queued offline under a different currency is rejected as a
-- conflict instead of being silently re-labelled.
drop function if exists public.record_purchase_idempotent(uuid, uuid, text, uuid, jsonb, text);
create or replace function public.record_purchase_idempotent(
  p_pharmacy_id uuid,
  p_customer_id uuid,
  p_method text,
  p_staff_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_currency text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim record;
  v_purchase_id uuid;
  v_currency text;
begin
  select * into v_claim from private.claim_idempotency(p_pharmacy_id, auth.uid(), p_idempotency_key, 'record_purchase');
  if v_claim.is_replay then
    -- Exactly-once: hand back the purchase created by the first attempt.
    return (v_claim.previous_result ->> 'purchase_id')::uuid;
  end if;

  if p_currency is not null and private.pharmacy_id() = p_pharmacy_id then
    v_currency := private.pharmacy_currency(p_pharmacy_id);
    if upper(trim(p_currency)) is distinct from v_currency then
      raise exception 'currency mismatch: this sale was priced in % but the pharmacy now records sales in %',
        upper(trim(p_currency)), v_currency using errcode = 'PT409';
    end if;
  end if;

  v_purchase_id := public.record_purchase(p_pharmacy_id, p_customer_id, p_method, p_staff_id, p_items);
  perform private.store_idempotent_result(p_pharmacy_id, p_idempotency_key,
    jsonb_build_object('purchase_id', v_purchase_id));
  return v_purchase_id;
end $$;

-- ===========================================================================
-- 5. Purchase orders default to the pharmacy's currency
-- ===========================================================================
create or replace function public.create_purchase_order(
  p_pharmacy_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_whatsapp_message text default null,
  p_currency text default null,
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
    if v_unit_price < 0 or v_unit_price > 100000000 then
      raise exception 'invalid order unit price: %', v_unit_price;
    end if;
    if v_product_id is not null
       and not exists (select 1 from public.products pr where pr.id = v_product_id and pr.pharmacy_id = p_pharmacy_id) then
      raise exception 'product does not belong to this pharmacy' using errcode = '42501';
    end if;
    v_total := v_total + (v_qty * v_unit_price);
  end loop;

  -- A null currency is filled from the pharmacy (trigger), and the trigger
  -- rejects currencies the pharmacy can't trade in.
  insert into public.purchase_orders (pharmacy_id, supplier_id, status, ordered_at, currency, total, whatsapp_message, created_by)
  values (p_pharmacy_id, p_supplier_id, coalesce(p_status, 'sent'),
          case when coalesce(p_status, 'sent') = 'draft' then null else now() end,
          nullif(trim(p_currency), ''), v_total, left(p_whatsapp_message, 4000), auth.uid())
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

create or replace function public.create_purchase_order_idempotent(
  p_pharmacy_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_whatsapp_message text default null,
  p_currency text default null
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
-- 6. Reporting RPCs on the pharmacy's business day, segmented by currency
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
  v_tz text;
  v_currency text;
  v_today date;
  v_from timestamptz;
begin
  v_pharmacy := private.pharmacy_id();  -- active profiles only
  v_role := private.user_role();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'forbidden: owner only' using errcode = '42501';
  end if;

  v_tz := private.pharmacy_timezone(v_pharmacy);
  v_currency := private.pharmacy_currency(v_pharmacy);
  v_today := (now() at time zone v_tz)::date;
  v_from := ((v_today - (v_days - 1))::timestamp at time zone v_tz);

  return query
  with member as (
    select up.id, up.name, up.role, up.last_seen_at
    from public.users_profiles up
    where up.pharmacy_id = v_pharmacy
  ),
  sales as (
    -- Totals are in the operating currency; never summed across currencies.
    select p.staff_id, p.amount, (p.purchased_at at time zone v_tz)::date as d
    from public.purchases p
    where p.pharmacy_id = v_pharmacy
      and p.currency_code = v_currency
      and p.purchased_at >= v_from
  )
  select m.id, m.name, m.role, m.last_seen_at,
         coalesce(sum(s.amount), 0)::numeric,
         count(s.*)::int,
         case when count(s.*) > 0 then round(coalesce(sum(s.amount), 0) / count(s.*), 2) else 0 end,
         coalesce((
           select jsonb_agg(jsonb_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'total', coalesce(t.total, 0)) order by g.d)
           from generate_series(v_today - (v_days - 1), v_today, interval '1 day') g(d)
           left join (
             select s2.d, sum(s2.amount) total from sales s2 where s2.staff_id = m.id group by s2.d
           ) t on t.d = g.d
         ), '[]'::jsonb)
  from member m
  left join sales s on s.staff_id = m.id
  group by m.id, m.name, m.role, m.last_seen_at
  order by 5 desc, m.name;
end $$;

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
  v_tz text;
  v_currency text;
  v_today date;
  v_from timestamptz;
  v_day_start timestamptz;
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

  -- Business days follow the pharmacy's timezone (from its row, not the client).
  v_tz := private.pharmacy_timezone(v_pharmacy);
  v_currency := private.pharmacy_currency(v_pharmacy);
  v_today := (now() at time zone v_tz)::date;
  v_day_start := (v_today::timestamp at time zone v_tz);
  v_from := ((v_today - (v_days - 1))::timestamp at time zone v_tz);

  select jsonb_build_object(
    'window_days', v_days,
    'generated_at', now(),
    'timezone', v_tz,
    'business_date', to_char(v_today, 'YYYY-MM-DD'),
    'currency', v_currency,
    -- Every figure below is in `currency`. Sales recorded in any other
    -- currency are reported separately here and never added in.
    'other_currencies', coalesce((
      select jsonb_agg(jsonb_build_object('currency', o.currency_code, 'total', o.total, 'transactions', o.cnt) order by o.currency_code)
      from (select p.currency_code, sum(p.amount) total, count(*) cnt
            from public.purchases p
            where p.pharmacy_id = v_pharmacy and p.purchased_at >= v_from and p.currency_code <> v_currency
            group by p.currency_code) o), '[]'::jsonb),
    'revenue', jsonb_build_object(
      'total', coalesce((select sum(p.amount) from public.purchases p
                         where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from), 0),
      'today', coalesce((select sum(p.amount) from public.purchases p
                         where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_day_start), 0),
      'transactions', coalesce((select count(*) from public.purchases p
                                where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from), 0),
      'by_method', coalesce((
        select jsonb_agg(jsonb_build_object('method', m.method, 'total', m.total, 'count', m.cnt) order by m.total desc)
        from (select p.method, sum(p.amount) total, count(*) cnt
              from public.purchases p
              where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from
              group by p.method) m), '[]'::jsonb),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object('day', to_char(g.d, 'YYYY-MM-DD'), 'total', coalesce(t.total, 0)) order by g.d)
        from generate_series(v_today - (v_days - 1), v_today, interval '1 day') g(d)
        left join (select (p.purchased_at at time zone v_tz)::date d, sum(p.amount) total
                   from public.purchases p
                   where p.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from
                   group by 1) t on t.d = g.d), '[]'::jsonb)
    ),
    -- Cost of goods sold, from the recorded line items and the product's unit cost.
    'cogs', jsonb_build_object(
      'total', coalesce((select sum(pi.qty * pr.unit_cost)
                         from public.purchase_items pi
                         join public.products pr on pr.id = pi.product_id
                         join public.purchases p on p.id = pi.purchase_id
                         where pi.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from), 0),
      'covered_line_items', coalesce((select count(*) from public.purchase_items pi
                                      join public.purchases p on p.id = pi.purchase_id
                                      where pi.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from
                                        and pi.product_id is not null), 0),
      'untracked_line_items', coalesce((select count(*) from public.purchase_items pi
                                        join public.purchases p on p.id = pi.purchase_id
                                        where pi.pharmacy_id = v_pharmacy and p.currency_code = v_currency and p.purchased_at >= v_from
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
-- 7. Onboarding and owner settings
-- ===========================================================================
-- Country-first onboarding. The legacy onboard_new_pharmacy keeps working and
-- now derives the country code from its free-text country.
create or replace function public.onboard_pharmacy(p_settings jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_pharmacy_id uuid;
  v_code text;
  v_methods text[];
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select up.pharmacy_id into v_existing from public.users_profiles up where up.id = v_user;
  if v_existing is not null then
    return v_existing;  -- a member can never create or hop into another pharmacy
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'settings must be a JSON object' using errcode = '22023';
  end if;
  if coalesce(trim(p_settings->>'name'), '') = '' then
    raise exception 'pharmacy name is required' using errcode = '22023';
  end if;
  v_code := upper(trim(coalesce(p_settings->>'country_code', '')));
  if v_code = '' then
    raise exception 'country is required' using errcode = '22023';
  end if;
  if p_settings ? 'payment_methods' and jsonb_typeof(p_settings->'payment_methods') = 'array' then
    select array_agg(x) into v_methods from jsonb_array_elements_text(p_settings->'payment_methods') x;
  end if;

  insert into public.pharmacies (name, country_code, default_currency, timezone, locale, payment_methods,
                                 city, address, phone, whatsapp, address_fields)
  values (left(trim(p_settings->>'name'), 200), v_code,
          nullif(p_settings->>'default_currency', ''), nullif(p_settings->>'timezone', ''),
          nullif(p_settings->>'locale', ''), v_methods,
          left(nullif(trim(p_settings->>'city'), ''), 200), left(nullif(trim(p_settings->>'address'), ''), 500),
          left(nullif(trim(p_settings->>'phone'), ''), 40), left(nullif(trim(p_settings->>'whatsapp'), ''), 40),
          case when jsonb_typeof(p_settings->'address_fields') = 'object' then p_settings->'address_fields' else '{}'::jsonb end)
  returning id into v_pharmacy_id;

  insert into public.users_profiles (id, pharmacy_id, role, name, email)
  values (v_user, v_pharmacy_id, 'owner', left(coalesce(nullif(trim(p_settings->>'owner_name'), ''), 'Owner'), 200),
          (select u.email from auth.users u where u.id = v_user));

  return v_pharmacy_id;
end $$;

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
begin
  return public.onboard_pharmacy(jsonb_build_object(
    'name', p_pharmacy_name,
    -- Unknown or blank legacy values keep the historical default (Liberia).
    'country_code', coalesce(private.country_code_for(p_country), 'LR'),
    'city', p_city, 'address', p_address, 'phone', p_phone, 'whatsapp', p_whatsapp,
    'owner_name', p_owner_name));
end $$;

-- Owner-only settings. Validation and the country/currency lock live in the
-- pharmacies trigger, so there is exactly one place that enforces them.
create or replace function public.update_pharmacy_settings(p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pharmacy uuid;
  v_key text;
  v_allowed text[] := array['name','city','address','phone','whatsapp','country_code','default_currency',
                            'timezone','locale','payment_methods','address_fields','regulatory'];
  v_methods text[];
  v_row public.pharmacies;
begin
  v_pharmacy := private.pharmacy_id();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not private.is_owner() then
    raise exception 'forbidden: owner only' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'changes must be a JSON object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'setting % cannot be changed here', v_key using errcode = '22023';
    end if;
  end loop;
  if p_changes ? 'name' and coalesce(trim(p_changes->>'name'), '') = '' then
    raise exception 'pharmacy name is required' using errcode = '22023';
  end if;
  if p_changes ? 'payment_methods' then
    if jsonb_typeof(p_changes->'payment_methods') = 'array' then
      select coalesce(array_agg(x), '{}') into v_methods from jsonb_array_elements_text(p_changes->'payment_methods') x;
    elsif jsonb_typeof(p_changes->'payment_methods') <> 'null' then
      raise exception 'payment_methods must be a list' using errcode = '22023';
    end if;
  end if;

  update public.pharmacies ph set
    name = case when p_changes ? 'name' then left(trim(p_changes->>'name'), 200) else ph.name end,
    city = case when p_changes ? 'city' then left(nullif(trim(p_changes->>'city'), ''), 200) else ph.city end,
    address = case when p_changes ? 'address' then left(nullif(trim(p_changes->>'address'), ''), 500) else ph.address end,
    phone = case when p_changes ? 'phone' then left(nullif(trim(p_changes->>'phone'), ''), 40) else ph.phone end,
    whatsapp = case when p_changes ? 'whatsapp' then left(nullif(trim(p_changes->>'whatsapp'), ''), 40) else ph.whatsapp end,
    country_code = case when p_changes ? 'country_code' then p_changes->>'country_code' else ph.country_code end,
    default_currency = case when p_changes ? 'default_currency' then p_changes->>'default_currency' else ph.default_currency end,
    timezone = case when p_changes ? 'timezone' then p_changes->>'timezone' else ph.timezone end,
    locale = case when p_changes ? 'locale' then p_changes->>'locale' else ph.locale end,
    payment_methods = case when p_changes ? 'payment_methods' then v_methods else ph.payment_methods end,
    address_fields = case when p_changes ? 'address_fields' then coalesce(p_changes->'address_fields', '{}'::jsonb) else ph.address_fields end,
    regulatory = case when p_changes ? 'regulatory' then coalesce(p_changes->'regulatory', '{}'::jsonb) else ph.regulatory end,
    updated_at = now()
  where ph.id = v_pharmacy
  returning * into v_row;

  return to_jsonb(v_row);
end $$;

-- What the client needs to render and validate settings offline: the
-- pharmacy's own rules plus whether country/currency are still changeable.
create or replace function public.pharmacy_country_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_pharmacy uuid; v_result jsonb;
begin
  v_pharmacy := private.pharmacy_id();
  if v_pharmacy is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'country_code', ph.country_code,
    'default_currency', ph.default_currency,
    'timezone', ph.timezone,
    'locale', ph.locale,
    'payment_methods', coalesce(ph.payment_methods, r.default_payment_methods),
    'available_payment_methods', r.payment_methods,
    'trade_currencies', private.allowed_trade_currencies(ph.country_code),
    'business_date', to_char((now() at time zone ph.timezone)::date, 'YYYY-MM-DD'),
    'country_locked', exists (select 1 from public.purchases p where p.pharmacy_id = ph.id)
  ) into v_result
  from public.pharmacies ph join private.country_rules r on r.code = ph.country_code
  where ph.id = v_pharmacy;
  return v_result;
end $$;

-- ===========================================================================
-- 8. Privileges
-- ===========================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('record_purchase','record_purchase_idempotent','create_purchase_order',
                        'create_purchase_order_idempotent','staff_performance','financial_summary',
                        'onboard_new_pharmacy','update_pharmacy_settings','pharmacy_country_context')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- onboard_pharmacy is for signed-in users who have no pharmacy yet.
revoke all on function public.onboard_pharmacy(jsonb) from public, anon;
grant execute on function public.onboard_pharmacy(jsonb) to authenticated, service_role;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
