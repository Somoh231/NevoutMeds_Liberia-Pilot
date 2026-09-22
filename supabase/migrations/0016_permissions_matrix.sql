-- Phase 4 — finish the permissions matrix.
--
--  * Destructive deletes of master data (customers, products, suppliers,
--    supplier catalogue, purchase orders) are owner/admin work. Staff keep full
--    day-to-day rights: creating and updating records, selling, adjusting
--    stock, and managing reminders.
--  * The pharmacy's own profile becomes editable by its owner (settings), with
--    the tenant key itself still immutable.

-- Deletes: owner/admin only.
do $$
declare r record;
begin
  for r in select unnest(array['customers','products','suppliers','supplier_catalogue','purchase_orders']) as t
  loop
    execute format('drop policy if exists %I on public.%I', r.t || '_delete', r.t);
    execute format($f$
      create policy %I on public.%I for delete to authenticated
      using (pharmacy_id = (select private.pharmacy_id()) and (select private.is_owner()))
    $f$, r.t || '_delete', r.t);
  end loop;
end $$;

-- Pharmacy settings: the owner may maintain their own pharmacy's details.
drop policy if exists pharmacies_update on public.pharmacies;
create policy pharmacies_update on public.pharmacies for update to authenticated
using (id = (select private.pharmacy_id()) and (select private.is_owner()))
with check (id = (select private.pharmacy_id()) and (select private.is_owner()));

revoke update on public.pharmacies from authenticated;
grant update (name, country, city, address, phone, whatsapp, updated_at) on public.pharmacies to authenticated;
revoke insert, delete on public.pharmacies from authenticated;
