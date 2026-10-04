-- NV-IMP-02 (P2): product names are unique per pharmacy regardless of case and
-- spacing. PROPOSED — not applied to production until the owner authorises it.
--
-- Until now the only guard was products_pharmacy_name_unique (pharmacy_id, name),
-- which is case- and space-sensitive (0007). Importing "paracetamol" or
-- "Paracetamol " next to an existing "Paracetamol" created a second product, and
-- import_inventory_levels (which matches lower(name)) then wrote stock to an
-- arbitrary one of the two.
--
--   1. Names are stored with spacing normalised: runs of whitespace (including
--      the non-breaking spaces spreadsheets carry) become one space, and
--      leading/trailing whitespace is dropped.
--   2. unique (pharmacy_id, lower(name)) — the database refuses a case-only
--      duplicate from any path: create_product, update_product_checked, the
--      spreadsheet upsert, or a direct PostgREST insert/update.
--   3. On INSERT, a name that matches an existing product of the same pharmacy
--      apart from case takes that product's spelling. The spreadsheet import's
--      upsert (ON CONFLICT (pharmacy_id, name)) therefore updates or skips the
--      existing product instead of failing the whole file; a plain insert gets
--      the usual duplicate-name error. Renaming a product onto another product's
--      name in different case is refused by (2).
--
-- Existing data: if any pharmacy already has names that collide under this rule
-- the migration stops before changing anything and lists how many; merging two
-- products (sales, stock, purchases) is a manual decision, never automatic.
-- Production had 0 products when this was written.
--
-- Rollback: drop trigger products_normalize_name on public.products;
-- drop function private.normalize_product_name(); drop function
-- private.squish_product_name(text); drop index
-- public.products_pharmacy_name_ci_unique. Normalised names stay as they are.

-- Same characters as JavaScript's \s, which the import screen uses for its own
-- duplicate check, so the browser and the database agree on what "the same
-- name" is.
create or replace function private.squish_product_name(p_name text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(p_name,
    E'[[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', ' ', 'g'))
$$;

-- ── Refuse to run over existing collisions ─────────────────────────────────
do $$
declare
  v_groups int;
begin
  select count(*) into v_groups
  from (
    select 1
    from public.products
    group by pharmacy_id, lower(private.squish_product_name(name))
    having count(*) > 1
  ) d;
  if v_groups > 0 then
    raise exception 'NV-IMP-02: % product name group(s) differ only by case or spacing within a pharmacy; resolve them before applying this migration', v_groups
      using hint = 'List them with: select pharmacy_id, lower(btrim(regexp_replace(name, E''[[:space:]\\u00a0]+'', '' '', ''g''))) k, array_agg(id), array_agg(name) from public.products group by 1, 2 having count(*) > 1';
  end if;
end $$;

-- ── 1. Normalise spacing in stored names ───────────────────────────────────
update public.products
   set name = private.squish_product_name(name)
 where name is distinct from private.squish_product_name(name);

-- ── 2. Case-insensitive uniqueness ─────────────────────────────────────────
create unique index if not exists products_pharmacy_name_ci_unique
  on public.products (pharmacy_id, lower(name));

-- ── 3. Normalise on every write; reuse an existing spelling on insert ──────
-- SECURITY INVOKER: the lookup sees only what the caller's RLS allows, which is
-- the caller's own pharmacy (the row's pharmacy, or the insert is refused anyway).
-- If it sees nothing, the unique index above is still the guarantee.
create or replace function private.normalize_product_name()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_existing text;
begin
  new.name := private.squish_product_name(new.name);
  if tg_op = 'INSERT' then
    select p.name into v_existing
    from public.products p
    where p.pharmacy_id = new.pharmacy_id
      and lower(p.name) = lower(new.name)
    limit 1;
    if v_existing is not null then
      new.name := v_existing;
    end if;
  end if;
  return new;
end $$;

revoke all on function private.normalize_product_name(), private.squish_product_name(text) from public, anon;
grant execute on function private.normalize_product_name(), private.squish_product_name(text) to authenticated, service_role;

drop trigger if exists products_normalize_name on public.products;
create trigger products_normalize_name
  before insert or update of name on public.products
  for each row execute function private.normalize_product_name();
