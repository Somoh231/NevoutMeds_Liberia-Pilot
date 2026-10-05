-- NV-LEAD-02 (P2): customers and products cannot be hard-deleted through the API.
-- PROPOSED — not applied to production until the owner authorises it.
--
-- An owner (customers.delete / inventory.delete, aal2) could DELETE a customer or a
-- product through PostgREST. The composite foreign keys then cascaded the history
-- away with no audit row:
--   customers → purchases → purchase_items, reminders     (sales and refill history)
--   products  → inventory, stock_movements                (stock ledger)
-- Direct writes to those ledgers are otherwise revoked (0011), so this was the one
-- way to erase them. The app never issues these deletes: it has no delete screen
-- for customers or products, and no offline mutation deletes them.
--
-- There is no controlled server-side deletion workflow yet, so ordinary pharmacy
-- users (authenticated) lose DELETE on both tables, and the two delete policies are
-- dropped so that a later re-grant would still delete nothing (RLS denies a command
-- with no policy). Reads, inserts, updates, imports (PostgREST upsert = INSERT … ON
-- CONFLICT DO UPDATE), sales and stock RPCs are unaffected. service_role and the
-- migration owner keep DELETE for operator maintenance; anon never had it.
-- The customers.delete / inventory.delete capabilities stay in the catalogue,
-- reserved for a future audited deletion or archive workflow.
--
-- Suppliers, the supplier catalogue and purchase orders keep their owner-only
-- delete policies: deleting them removes no sales or stock ledger.
--
-- Rollback: grant delete on public.customers, public.products to authenticated;
-- then recreate customers_delete / products_delete exactly as in
-- 0020_capabilities_mfa.sql §7 (has_capability 'customers.delete' /
-- 'inventory.delete').

revoke delete on public.customers, public.products from authenticated, anon;

drop policy if exists customers_delete on public.customers;
drop policy if exists products_delete on public.products;
