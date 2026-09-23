#!/usr/bin/env bash
# NevOut Meds — independent logical database backup.
#
# Produces   $NEVOUT_BACKUP_DIR/nevoutmeds-db-<project>-<UTC stamp>.tar.gz.enc  (+ .meta.json)
# containing:
#   schema.sql          public + private schemas (tables, functions, RLS policies, triggers, grants)
#   data-app.sql        all rows in public + private (includes the country registry)
#   data-auth.sql       auth.users + auth.identities ONLY (no sessions, refresh tokens or audit logs)
#   data-migrations.sql supabase_migrations.schema_migrations (which migrations are applied)
#   manifest.json       row counts, schema fingerprint, registry checksum, integrity invariants
# Encrypted with AES-256-GCM (ops/backup/nvcrypt.mjs), verified by decrypting it
# again, copied to $NEVOUT_BACKUP_DEST, pruned per retention, and recorded in
# private.backup_runs when the heartbeat is configured.
#
# NOT included: Supabase Storage files (see backup-storage.sh), auth settings,
# Edge Function code/secrets, platform settings. Exit status is non-zero on any failure.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
nv_load_env

STARTED=$(nv_now); T0=$(nv_ms)
NAME="nevoutmeds-db-${NEVOUT_BACKUP_PROJECT}-$(nv_stamp)"
WORK=$(mktemp -d); chmod 700 "$WORK"
ENGINE=$(nv_engine)
cleanup() { rm -rf "$WORK"; }
fail() {
  local msg="$1"
  nv_log error backup_failed "kind=database" "artifact=$NAME" "engine=$ENGINE" "error=$msg"
  nv_heartbeat "$(node -e 'const [k,s,st,a,e,h,d]=process.argv.slice(1);process.stdout.write(JSON.stringify({kind:k,status:s,started_at:st,artifact:a,destination:d,host:h,detail:{error:e}}))' database failure "$STARTED" "$NAME" "$msg" "$(hostname)" "$NEVOUT_BACKUP_DEST")"
  cleanup; exit 1
}
trap 'fail "command failed at line $LINENO"' ERR
trap cleanup EXIT

nv_log info backup_started "kind=database" "artifact=$NAME" "engine=$ENGINE" "dest=$NEVOUT_BACKUP_DEST"

case "$ENGINE" in
  pg)
    URL=$(nv_db_url)
    nv_pg pg_dump "$URL" --schema-only --no-owner --schema=public --schema=private > "$WORK/schema.sql" 2>>"$WORK/pg_dump.log"
    nv_pg pg_dump "$URL" --data-only --no-owner --schema=public --schema=private > "$WORK/data-app.sql" 2>>"$WORK/pg_dump.log"
    nv_pg pg_dump "$URL" --data-only --no-owner --table=auth.users --table=auth.identities > "$WORK/data-auth.sql" 2>>"$WORK/pg_dump.log"
    if [ "$(nv_pg psql "$URL" -X -q -A -t -c "select to_regclass('supabase_migrations.schema_migrations') is not null")" = "t" ]; then
      nv_pg pg_dump "$URL" --data-only --no-owner --table=supabase_migrations.schema_migrations > "$WORK/data-migrations.sql" 2>>"$WORK/pg_dump.log"
    else
      echo "-- no supabase_migrations.schema_migrations on the source" > "$WORK/data-migrations.sql" 2>>"$WORK/pg_dump.log"
    fi
    nv_sql_value "$NV_BACKUP_HOME/sql/manifest.sql" "$URL" > "$WORK/source-manifest.json"
    ;;
  supabase-cli)
    cd "$NV_REPO_ROOT"
    supabase db dump --linked -s public,private -f "$WORK/schema.sql" >/dev/null 2>&1
    supabase db dump --linked --data-only -s public,private -f "$WORK/data-app.sql" >/dev/null 2>&1
    # Keep only auth.users and auth.identities: exclude every other auth table (sessions, tokens, logs).
    EXCL=$(supabase db query --linked --agent=no -o csv \
      "select string_agg('auth.' || table_name, ',') from information_schema.tables where table_schema='auth' and table_type='BASE TABLE' and table_name not in ('users','identities')" 2>/dev/null | tail -1 | tr -d '"')
    supabase db dump --linked --data-only -s auth -x "$EXCL" -f "$WORK/data-auth.sql" >/dev/null 2>&1
    supabase db dump --linked --data-only -s supabase_migrations -f "$WORK/data-migrations.sql" >/dev/null 2>&1
    nv_sql_value "$NV_BACKUP_HOME/sql/manifest.sql" --linked > "$WORK/source-manifest.json"
    ;;
  *) fail "no dump engine: set NEVOUT_BACKUP_DB_URL(_FILE) or install/link the Supabase CLI" ;;
esac

for f in schema.sql data-app.sql data-auth.sql source-manifest.json; do
  [ -s "$WORK/$f" ] || fail "$f is empty"
done
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$WORK/source-manifest.json" || fail "manifest is not valid JSON"
grep -q "CREATE TABLE" "$WORK/schema.sql" || fail "schema dump contains no tables"

# Package metadata + checksums of every member file.
node -e '
  const fs = require("fs"), crypto = require("crypto"), path = require("path");
  const [dir, name, engine, started, project] = process.argv.slice(1);
  const files = {};
  // Only the members that go into the archive (not scratch files like pg_dump.log).
  for (const f of ["schema.sql", "data-app.sql", "data-auth.sql", "data-migrations.sql", "source-manifest.json"]) files[f] = { bytes: fs.statSync(path.join(dir, f)).size, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex") };
  const source = JSON.parse(fs.readFileSync(path.join(dir, "source-manifest.json"), "utf8"));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ format: "nevoutmeds-db-v1", artifact: name, project, engine, started_at: started, files, source }, null, 2));
' "$WORK" "$NAME" "$ENGINE" "$STARTED" "$NEVOUT_BACKUP_PROJECT"

tar -czf "$WORK/$NAME.tar.gz" -C "$WORK" schema.sql data-app.sql data-auth.sql data-migrations.sql source-manifest.json manifest.json
OUT="$NEVOUT_BACKUP_DIR/$NAME.tar.gz.enc"
nv_encrypt "$WORK/$NAME.tar.gz" "$OUT" || fail "encryption failed"

# Prove the artifact is restorable before calling it a backup.
nv_decrypt "$OUT" "$WORK/verify.tar.gz" || fail "the encrypted artifact could not be decrypted"
tar -tzf "$WORK/verify.tar.gz" | grep -q '^manifest.json$' || fail "the decrypted artifact is not a complete archive"

BYTES=$(nv_size "$OUT"); SHA=$(nv_sha256 "$OUT")
node -e '
  const fs = require("fs"); const [out, name, bytes, sha, started, engine, project] = process.argv.slice(1);
  const m = JSON.parse(fs.readFileSync(process.argv[8], "utf8"));
  fs.writeFileSync(out, JSON.stringify({ artifact: name + ".tar.gz.enc", kind: "database", project, engine, created_at: new Date().toISOString(), started_at: started,
    bytes: Number(bytes), sha256: sha, encryption: "NVBK1 AES-256-GCM, scrypt(N=2^15,r=8,p=1)",
    rows: m.source.rows, migrations: m.source.migrations, country_registry_md5: m.source.country_registry_md5 }, null, 2), { mode: 0o600 });
' "$NEVOUT_BACKUP_DIR/$NAME.meta.json" "$NAME" "$BYTES" "$SHA" "$STARTED" "$ENGINE" "$NEVOUT_BACKUP_PROJECT" "$WORK/manifest.json"

nv_upload "$OUT" "db/$NAME.tar.gz.enc" || fail "upload to $NEVOUT_BACKUP_DEST failed"
nv_upload "$NEVOUT_BACKUP_DIR/$NAME.meta.json" "db/$NAME.meta.json" || fail "metadata upload failed"
PRUNED=$(nv_prune db)
MS=$(( $(nv_ms) - T0 ))

nv_log info backup_succeeded "kind=database" "artifact=$NAME.tar.gz.enc" "bytes=$BYTES" "sha256=$SHA" "engine=$ENGINE" "dest=$NEVOUT_BACKUP_DEST" "duration_ms=$MS" "pruned=$PRUNED"
nv_heartbeat "$(node -e 'const [k,s,st,a,b,sh,d,h,ms,e]=process.argv.slice(1);process.stdout.write(JSON.stringify({kind:k,status:s,started_at:st,artifact:a,bytes:Number(b),sha256:sh,destination:d,host:h,detail:{duration_ms:Number(ms),engine:e}}))' database success "$STARTED" "$NAME.tar.gz.enc" "$BYTES" "$SHA" "$NEVOUT_BACKUP_DEST" "$(hostname)" "$MS" "$ENGINE")"
echo "$OUT"
