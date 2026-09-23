#!/usr/bin/env bash
# NevOut Meds — restore a logical database backup into a NEW, EMPTY database,
# then prove it: row counts, schema fingerprint (columns, constraints, RLS
# policies, functions, triggers, grants), country registry and integrity
# invariants must equal the backup's manifest, and a rolled-back functional
# check exercises tenant isolation and the sale RPC on the restored copy.
#
#   restore-db.sh <artifact.tar.gz.enc> --target-url <postgres-url> [options]
#     --schema-source backup|migrations   schema from the backup (default) or from supabase/migrations
#     --allow-nonempty                    target may already contain pharmacies (DANGEROUS)
#     --i-understand-this-is-the-source   allow the target to equal NEVOUT_BACKUP_DB_URL (DANGEROUS)
#
# The target must be a Supabase database (a new project, or a rehearsal
# database with the Supabase auth schema); see docs/BACKUP_AND_RECOVERY.md.
# Exit status: 0 = restored and validated, 1 = failed or validation mismatch.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
nv_load_env

ART=""; TARGET="${NEVOUT_RESTORE_DB_URL:-}"; SCHEMA_SOURCE=backup; ALLOW_NONEMPTY=0; ALLOW_SOURCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target-url) TARGET="$2"; shift 2 ;;
    --schema-source) SCHEMA_SOURCE="$2"; shift 2 ;;
    --allow-nonempty) ALLOW_NONEMPTY=1; shift ;;
    --i-understand-this-is-the-source) ALLOW_SOURCE=1; shift ;;
    -*) echo "unknown option $1" >&2; exit 64 ;;
    *) ART="$1"; shift ;;
  esac
done
[ -f "$ART" ] || { echo "usage: restore-db.sh <artifact.tar.gz.enc> --target-url <url>" >&2; exit 64; }
[ -n "$TARGET" ] || { echo "--target-url (or NEVOUT_RESTORE_DB_URL) is required" >&2; exit 64; }

SOURCE_URL=$(nv_db_url || true)
if [ -n "$SOURCE_URL" ] && [ "$TARGET" = "$SOURCE_URL" ] && [ $ALLOW_SOURCE -eq 0 ]; then
  echo "refusing: the target is the backup source database. Restore into a NEW database." >&2; exit 1
fi

WORK=$(mktemp -d); chmod 700 "$WORK"; trap 'rm -rf "$WORK"' EXIT
T0=$(nv_ms)
nv_log info restore_started "artifact=$(basename "$ART")" "schema_source=$SCHEMA_SOURCE"

EXISTS=$(nv_pg psql "$TARGET" -X -q -A -t -c "select to_regclass('public.pharmacies') is not null" 2>"$WORK/connect.err" || echo "?")
if [ "$EXISTS" = "?" ]; then echo "cannot connect to the target database: $(tail -1 "$WORK/connect.err")" >&2; exit 1; fi
HAS_PH=0
[ "$EXISTS" = "t" ] && HAS_PH=$(nv_pg psql "$TARGET" -X -q -A -t -c "select count(*) from public.pharmacies")
if [ "$HAS_PH" != "0" ] && [ $ALLOW_NONEMPTY -eq 0 ]; then
  echo "refusing: the target already has $HAS_PH pharmacies. Restore into an empty database (or pass --allow-nonempty)." >&2; exit 1
fi

nv_decrypt "$ART" "$WORK/a.tar.gz"
tar -xzf "$WORK/a.tar.gz" -C "$WORK"
node -e '
  const fs = require("fs"), crypto = require("crypto"), path = require("path");
  const dir = process.argv[1]; const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  for (const [f, e] of Object.entries(m.files)) {
    const h = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex");
    if (h !== e.sha256) { console.error("member " + f + " does not match its checksum"); process.exit(1); }
  }' "$WORK"
T1=$(nv_ms)

# 1. Schema.
if [ "$SCHEMA_SOURCE" = "migrations" ]; then
  for f in $(ls "$NV_REPO_ROOT/supabase/migrations" | sort); do
    nv_pg psql "$TARGET" -X -q -v ON_ERROR_STOP=1 --single-transaction < "$NV_REPO_ROOT/supabase/migrations/$f" >/dev/null
  done
else
  # Every Supabase database already has the public schema (and may have private
  # after a partial attempt): create schemas only when missing.
  # Default privileges FOR ROLE supabase_admin are platform-owned: every new
  # project already has them and only the platform can set them, so they are
  # skipped. Every object-level GRANT/REVOKE (the app's permissions) is applied.
  # A new project grants default privileges (including to anon) on every table
  # postgres creates in public, and pg_dump only re-applies the source's GRANTs.
  # Clear postgres's defaults first so each restored object starts owner-only
  # and ends with exactly the source's permissions; the dump's own trailing
  # ALTER DEFAULT PRIVILEGES FOR ROLE postgres statements then restore the
  # source's defaults. (Without this, anon would regain table privileges that
  # production revoked — the restore validation checks for exactly that.)
  {
    echo "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;"
    echo "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;"
    echo "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;"
    sed -E -e 's/^CREATE SCHEMA ([a-z_"]+);/CREATE SCHEMA IF NOT EXISTS \1;/' \
           -e '/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin /d' "$WORK/schema.sql"
  } > "$WORK/schema-apply.sql"
  nv_pg psql "$TARGET" -X -q -v ON_ERROR_STOP=1 --single-transaction < "$WORK/schema-apply.sql" >/dev/null
fi
T2=$(nv_ms)

# 2. Data. Triggers and FK checks are suspended for the load (the rows were
# valid when dumped); rows seeded by the migrations themselves (the country
# registry) are replaced by the backed-up copy.
{
  echo "set session_replication_role = replica;"
  echo "delete from private.country_rules;"
  cat "$WORK/data-auth.sql" "$WORK/data-app.sql"
  if grep -q "schema_migrations" "$WORK/data-migrations.sql"; then
    echo "create schema if not exists supabase_migrations;"
    echo "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
    echo "delete from supabase_migrations.schema_migrations;"
    cat "$WORK/data-migrations.sql"
  fi
  echo "set session_replication_role = origin;"
} > "$WORK/load.sql"
nv_pg psql "$TARGET" -X -q -v ON_ERROR_STOP=1 --single-transaction < "$WORK/load.sql" >/dev/null
T3=$(nv_ms)

# 3. Validate against the manifest.
nv_sql_value "$NV_BACKUP_HOME/sql/manifest.sql" "$TARGET" > "$WORK/target-manifest.json"
FUNC=$(nv_pg psql "$TARGET" -X -q -A -t < "$NV_BACKUP_HOME/sql/functional-check.sql" | grep '^{' | tail -1)
REPORT=$(node -e '
  const fs = require("fs");
  const src = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).source;
  const dst = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const func = process.argv[3] ? JSON.parse(process.argv[3]) : null;
  const problems = [];
  for (const [t, n] of Object.entries(src.rows)) if (dst.rows[t] !== n) problems.push(`rows ${t}: backup ${n}, restored ${dst.rows[t]}`);
  for (const [k, f] of Object.entries(src.fingerprint)) {
    const d = dst.fingerprint[k];
    if (!d || d.md5 !== f.md5) problems.push(`schema ${k}: ${f.objects} objects in backup, ${d ? d.objects : 0} restored${d && d.objects === f.objects ? " (definitions differ)" : ""}`);
  }
  if (src.country_registry_md5 !== dst.country_registry_md5) problems.push("country registry differs");
  if (dst.rls_disabled_tables !== 0) problems.push(`${dst.rls_disabled_tables} public table(s) without RLS`);
  if (JSON.stringify(src.integrity) !== JSON.stringify(dst.integrity)) problems.push(`integrity differs: ${JSON.stringify(src.integrity)} vs ${JSON.stringify(dst.integrity)}`);
  if (src.migrations && JSON.stringify(src.migrations) !== JSON.stringify(dst.migrations)) problems.push("applied-migrations list differs");
  if (func && func.ok === false) problems.push("functional check failed: " + JSON.stringify(func));
  const rows = Object.values(dst.rows).reduce((a, b) => a + b, 0);
  console.log(JSON.stringify({ ok: problems.length === 0, tables: Object.keys(src.rows).length, rows,
    schema_objects: Object.values(dst.fingerprint).reduce((a, f) => a + f.objects, 0), functional: func, problems }));
' "$WORK/manifest.json" "$WORK/target-manifest.json" "$FUNC")
T4=$(nv_ms)

echo "$REPORT"
if node -e 'process.exit(JSON.parse(process.argv[1]).ok ? 0 : 1)' "$REPORT"; then
  nv_log info restore_validated "artifact=$(basename "$ART")" "decrypt_ms=$((T1 - T0))" "schema_ms=$((T2 - T1))" "data_ms=$((T3 - T2))" "validate_ms=$((T4 - T3))" "total_ms=$((T4 - T0))"
  echo "restore OK: decrypt+verify $((T1 - T0)) ms, schema $((T2 - T1)) ms, data $((T3 - T2)) ms, validation $((T4 - T3)) ms, total $((T4 - T0)) ms" >&2
else
  nv_log error restore_validation_failed "artifact=$(basename "$ART")" "report=$REPORT"
  exit 1
fi
