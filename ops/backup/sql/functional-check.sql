-- NevOut Meds restore functional check. Runs inside a transaction that is
-- ALWAYS rolled back, so the restored database is left exactly as restored.
-- Proves on the restored copy that tenant isolation (RLS) and the sale RPC
-- (stock movement, currency stamp) behave as in production.
begin;
create temp table nv_check (result jsonb) on commit drop;
do $$
declare
  v_owner uuid; v_ph uuid; v_cust uuid; v_prod uuid; v_stock_before int; v_stock_after int;
  v_visible_ph int; v_foreign int; v_sale uuid; v_currency text; v_total_ph int;
begin
  select count(*) into v_total_ph from public.pharmacies;
  select up.id, up.pharmacy_id into v_owner, v_ph
  from public.users_profiles up
  join public.customers c on c.pharmacy_id = up.pharmacy_id
  join public.inventory i on i.pharmacy_id = up.pharmacy_id and i.stock > 0
  where up.role = 'owner' and coalesce(up.status, 'active') = 'active'
  limit 1;
  if v_owner is null then
    insert into nv_check values (jsonb_build_object('skipped', 'no owner with a customer and stock to exercise'));
    return;
  end if;
  select c.id into v_cust from public.customers c where c.pharmacy_id = v_ph limit 1;
  select i.product_id, i.stock into v_prod, v_stock_before from public.inventory i where i.pharmacy_id = v_ph and i.stock > 0 limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;
  select count(*) into v_visible_ph from public.pharmacies;
  select count(*) into v_foreign from public.purchases where pharmacy_id <> v_ph;
  v_sale := public.record_purchase(v_ph, v_cust, 'Cash', null,
    jsonb_build_array(jsonb_build_object('product_id', v_prod::text, 'name', 'restore check', 'qty', 1, 'unit_price', 1)));
  reset role;
  select stock into v_stock_after from public.inventory where pharmacy_id = v_ph and product_id = v_prod;
  select currency_code into v_currency from public.purchases where id = v_sale;

  insert into nv_check values (jsonb_build_object(
    'pharmacies_in_db', v_total_ph,
    'pharmacies_visible_to_owner', v_visible_ph,
    'foreign_sales_visible_to_owner', v_foreign,
    'sale_recorded', v_sale is not null,
    'stock_before', v_stock_before, 'stock_after', v_stock_after,
    'sale_currency', v_currency,
    'ok', v_visible_ph = 1 and v_foreign = 0 and v_sale is not null and v_stock_after = v_stock_before - 1 and v_currency is not null));
end $$;
select result::text from nv_check;
rollback;
