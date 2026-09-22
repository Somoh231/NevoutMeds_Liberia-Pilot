#!/usr/bin/env bash
# NevOut Meds — local, fresh-database validation harness.
#
# Builds a brand-new database (nevout_verify) inside the LOCAL NevOut Meds
# Supabase DB container, seeds it with the pristine Supabase `auth` schema,
# applies every migration in supabase/migrations in order (ON_ERROR_STOP,
# one transaction per file, no manual intervention), then runs every
# supabase/tests/*.test.sql file.
#
# It never talks to the linked cloud project. It uses `docker exec` instead of
# the host port mapping because Docker Desktop's port proxy was unreliable
# on this machine.
#
# Usage: supabase/tests/run_local_validation.sh [--keep]
set -euo pipefail

CONTAINER="${NEVOUT_DB_CONTAINER:-supabase_db_NevOutMeds_Liberia_Pilot}"
DB="nevout_verify"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE_DIR="/tmp/nevout_validation"

# Hard limits so a bad policy (e.g. recursive RLS helpers) or a lock can never
# hang the suite: every statement is capped, as is any lock wait.
PGOPTS="-c statement_timeout=15s -c lock_timeout=5s -c idle_in_transaction_session_timeout=30s"

psql_c() { docker exec -i -e PGOPTIONS="$PGOPTS" "$CONTAINER" psql -U supabase_admin -X -v ON_ERROR_STOP=1 "$@"; }

echo "== container: $CONTAINER"
docker exec "$CONTAINER" rm -rf "$REMOTE_DIR"
docker exec "$CONTAINER" mkdir -p "$REMOTE_DIR"
docker cp "$ROOT/supabase/migrations" "$CONTAINER:$REMOTE_DIR/migrations" >/dev/null
docker cp "$ROOT/supabase/tests" "$CONTAINER:$REMOTE_DIR/tests" >/dev/null

echo "== fresh database: $DB"
# Mirror a hosted Supabase database: owned by postgres, pristine `auth` schema,
# Supabase's `public` grants/default privileges, pgcrypto in `extensions`.
psql_c -d postgres -q -c "drop database if exists $DB with (force)" -c "create database $DB owner postgres"
docker exec "$CONTAINER" pg_dump -U supabase_admin -d postgres -s -n auth -f "$REMOTE_DIR/auth_baseline.sql"
psql_c -d "$DB" -q -f "$REMOTE_DIR/auth_baseline.sql" >/dev/null
# Hosted Supabase's auth.uid()/auth.role() read request.jwt.claims (the JSON
# PostgREST sets). Older local images only defined the request.jwt.claim.sub
# form, so normalise them or tests would not match production behaviour.
docker cp "$ROOT/supabase/tests/auth_claims_compat.sql" "$CONTAINER:$REMOTE_DIR/auth_claims_compat.sql" >/dev/null
psql_c -d "$DB" -q -f "$REMOTE_DIR/auth_claims_compat.sql" >/dev/null
psql_c -d "$DB" -q -c "drop schema public cascade" >/dev/null
psql_c -d "$DB" -q -f "$REMOTE_DIR/tests/public_baseline.sql" >/dev/null
psql_c -d "$DB" -q \
  -c "create schema if not exists extensions" \
  -c "grant usage on schema extensions to postgres, anon, authenticated, service_role" \
  -c "create extension if not exists pgcrypto with schema extensions" \
  -c "alter database $DB set search_path = \"\$user\", public, extensions" >/dev/null

echo "== migrations"
for f in $(ls "$ROOT/supabase/migrations" | sort); do
  # Same role the Supabase CLI uses to apply migrations.
  if docker exec -i -e PGOPTIONS="-c statement_timeout=60s -c lock_timeout=10s" "$CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 --single-transaction \
      -d "$DB" -f "$REMOTE_DIR/migrations/$f" >/tmp/nevout_mig.log 2>&1; then
    echo "  PASS $f"
  else
    echo "  FAIL $f"; cat /tmp/nevout_mig.log; exit 1
  fi
done

echo "== tests"
status=0
for t in $(ls "$ROOT/supabase/tests" | grep '\.test\.sql$' | sort); do
  if docker exec -i -e PGOPTIONS="$PGOPTS" "$CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 -d "$DB" \
      -f "$REMOTE_DIR/tests/$t" >/tmp/nevout_test.log 2>&1; then
    grep -oE 'NOTICE:  (not ok|ok|#).*' /tmp/nevout_test.log | sed 's/NOTICE:  /    /' || true
    echo "  PASS $t"
  else
    grep -oE 'NOTICE:  (not ok|ok|#).*' /tmp/nevout_test.log | sed 's/NOTICE:  /    /' || true
    grep -E 'ERROR|FAIL' /tmp/nevout_test.log | head -20
    echo "  FAIL $t"; status=1
  fi
done

if [ "${1:-}" != "--keep" ]; then
  psql_c -d postgres -q -c "drop database if exists $DB with (force)"
fi
exit $status
