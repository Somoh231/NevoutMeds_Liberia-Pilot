-- Pristine Supabase `public` schema baseline: ownership, grants and default
-- privileges exactly as a hosted project has them before any migration runs.
-- (Taken from a freshly initialised Supabase database; kept explicit so the
-- harness never derives its baseline from an already-migrated database.)
create schema if not exists public;
alter schema public owner to pg_database_owner;
comment on schema public is 'standard public schema';

grant usage on schema public to postgres, anon, authenticated, service_role;

alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables    to postgres, anon, authenticated, service_role;
