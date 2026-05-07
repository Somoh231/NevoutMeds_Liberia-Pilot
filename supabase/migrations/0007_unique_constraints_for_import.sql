-- Phase 6: constraints to support safe imports

-- Products: support upsert by (pharmacy_id, name)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_pharmacy_name_unique'
  ) then
    alter table public.products
      add constraint products_pharmacy_name_unique unique (pharmacy_id, name);
  end if;
end$$;

