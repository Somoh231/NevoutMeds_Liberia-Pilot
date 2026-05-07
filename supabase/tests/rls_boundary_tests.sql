-- Phase 5: Explicit RLS boundary tests
-- Run these in Supabase SQL editor as a privileged user to validate policies.
-- You will need:
-- - Two pharmacies: A and B
-- - Three auth users: ownerA, staffA, ownerB (and optionally admin)
-- - Corresponding users_profiles rows with matching pharmacy_id + roles
--
-- Supabase supports simulating auth context by setting these GUCs:
--   set local request.jwt.claim.sub = '<auth_user_uuid>';
-- For role, Supabase uses authenticated/anon implicitly in API; in SQL editor you can validate RLS behavior by using:
--   set local role authenticated;
-- if your environment supports it. Otherwise use the API to validate.

-- Helpers: replace with your UUIDs
-- \set ownerA '00000000-0000-0000-0000-000000000001'
-- \set staffA '00000000-0000-0000-0000-000000000002'
-- \set ownerB '00000000-0000-0000-0000-000000000003'
-- \set admin  '00000000-0000-0000-0000-000000000004'

-- 1) Pharmacy A cannot read Pharmacy B customers
-- set local role authenticated;
-- set local request.jwt.claim.sub = :'ownerA';
-- select count(*) from public.customers where pharmacy_id = (select pharmacy_id from public.users_profiles where id = :'ownerB');
-- Expect: 0

-- 2) Staff cannot manage users_profiles (insert staff or promote admin should fail)
-- set local request.jwt.claim.sub = :'staffA';
-- insert into public.users_profiles (id, pharmacy_id, role, name, email)
-- values (gen_random_uuid(), (select pharmacy_id from public.users_profiles where id = :'staffA'), 'staff', 'New Staff', 'x@example.com');
-- Expect: ERROR (policy violation)

-- 3) Owner can add staff within their pharmacy but cannot create admin
-- set local request.jwt.claim.sub = :'ownerA';
-- insert into public.users_profiles (id, pharmacy_id, role, name, email)
-- values (gen_random_uuid(), (select pharmacy_id from public.users_profiles where id = :'ownerA'), 'staff', 'New Staff', 'x@example.com');
-- Expect: OK
-- insert into public.users_profiles (id, pharmacy_id, role, name, email)
-- values (gen_random_uuid(), (select pharmacy_id from public.users_profiles where id = :'ownerA'), 'admin', 'Bad Admin', 'bad@example.com');
-- Expect: ERROR

-- 4) Unauthenticated users cannot read protected tables
-- set local role anon;
-- select count(*) from public.customers;
-- Expect: ERROR or 0 depending on environment; API should be denied.

-- 5) Admin can read across pharmacies (if you created an admin profile)
-- set local request.jwt.claim.sub = :'admin';
-- select count(*) from public.customers;
-- Expect: >= total across all pharmacies

