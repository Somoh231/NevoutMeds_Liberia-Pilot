#!/usr/bin/env bash
# NevOut Meds — restore rehearsal on the LOCAL Supabase stack (dev machines only).
# Creates a brand-new database with just the Supabase baseline (auth schema,
# default grants, extensions — what a new hosted project starts with), then
# runs the real restore-db.sh into it and prints its validation report.
#   rehearse-local.sh <nevoutmeds-db-*.tar.gz.enc> [--schema-source migrations]
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
nv_load_env
ART="${1:?usage: rehearse-local.sh <artifact> [restore options]}"; shift
C="${NEVOUT_DB_CONTAINER:-supabase_db_NevOutMeds_Liberia_Pilot}"
PORT="${NEVOUT_LOCAL_DB_PORT:-55422}"
DB="nevout_rehearsal_$(date -u +%Y%m%d%H%M%S)"
psql_c() { docker exec -i "$C" psql -U supabase_admin -X -q -v ON_ERROR_STOP=1 "$@"; }
T0=$(nv_ms)
psql_c -d postgres -c "create database $DB owner postgres" >/dev/null
docker exec "$C" sh -c "pg_dump -U supabase_admin -d postgres -s -n auth > /tmp/$DB-auth.sql"
psql_c -d "$DB" -f "/tmp/$DB-auth.sql" >/dev/null 2>&1 || true
docker exec "$C" rm -f "/tmp/$DB-auth.sql"
docker exec -i "$C" psql -U supabase_admin -X -q -d "$DB" < "$NV_REPO_ROOT/supabase/tests/auth_claims_compat.sql" >/dev/null 2>&1 || true
psql_c -d "$DB" -c "drop schema public cascade" >/dev/null
docker exec -i "$C" psql -U supabase_admin -X -q -v ON_ERROR_STOP=1 -d "$DB" < "$NV_REPO_ROOT/supabase/tests/public_baseline.sql" >/dev/null
psql_c -d "$DB" -c "create schema if not exists extensions" -c "grant usage on schema extensions to postgres, anon, authenticated, service_role" \
  -c "create extension if not exists pgcrypto with schema extensions" -c "alter database $DB set search_path = \"\$user\", public, extensions" >/dev/null
echo "fresh database $DB ready in $(( $(nv_ms) - T0 )) ms" >&2
"$NV_BACKUP_HOME/restore-db.sh" "$ART" --target-url "postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB}" "$@"
echo "rehearsal database: $DB (drop it with: docker exec $C psql -U supabase_admin -d postgres -c 'drop database $DB with (force)')" >&2
