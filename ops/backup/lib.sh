# shellcheck shell=bash
# Shared functions for the NevOut Meds backup scripts. Source, don't execute.
#
# Configuration comes from the environment, optionally loaded from
# ops/backup/backup.env (or $NEVOUT_BACKUP_ENV_FILE). That file is gitignored
# and must be chmod 600. See ops/backup/backup.env.example for every variable.

NV_BACKUP_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NV_REPO_ROOT="$(cd "$NV_BACKUP_HOME/../.." && pwd)"

nv_load_env() {
  umask 077   # backups, logs and temp files are private to the backup user
  local f="${NEVOUT_BACKUP_ENV_FILE:-$NV_BACKUP_HOME/backup.env}"
  if [ -f "$f" ]; then
    local mode; mode=$(stat -f '%Lp' "$f" 2>/dev/null || stat -c '%a' "$f")
    case "$mode" in
      600|400) ;;
      *) echo "refusing to read $f: permissions $mode (must be 600)" >&2; exit 78 ;;
    esac
    set -a; # shellcheck disable=SC1090
    . "$f"; set +a
  fi
  : "${NEVOUT_BACKUP_DIR:=$HOME/nevoutmeds-backups}"
  : "${NEVOUT_BACKUP_PROJECT:=prod}"
  : "${NEVOUT_BACKUP_DEST:=local}"
  : "${NEVOUT_BACKUP_RETENTION_DAYS:=30}"
  : "${NEVOUT_BACKUP_KEEP_MIN:=7}"
  : "${NEVOUT_BACKUP_ENGINE:=auto}"
  : "${NEVOUT_PG_IMAGE:=public.ecr.aws/supabase/postgres:17.6.1.166}"
  mkdir -p "$NEVOUT_BACKUP_DIR"; chmod 700 "$NEVOUT_BACKUP_DIR"
  NV_LOG="$NEVOUT_BACKUP_DIR/backup.log"
}

nv_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
nv_stamp() { date -u +%Y%m%dT%H%M%SZ; }
nv_ms() { node -e 'process.stdout.write(String(Date.now()))'; }

# One JSON line per event in backup.log, plus a readable line on stderr.
nv_log() {
  local level="$1" event="$2"; shift 2
  local json; json=$(node -e '
    const [level, event, ...kv] = process.argv.slice(1);
    const o = { at: new Date().toISOString(), level, event };
    for (const p of kv) { const i = p.indexOf("="); if (i > 0) o[p.slice(0, i)] = p.slice(i + 1); }
    process.stdout.write(JSON.stringify(o));' "$level" "$event" "$@")
  echo "$json" >> "$NV_LOG"
  echo "[$level] $event $*" >&2
}

nv_sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
nv_size() { stat -f '%z' "$1" 2>/dev/null || stat -c '%s' "$1"; }

nv_db_url() {
  if [ -n "${NEVOUT_BACKUP_DB_URL_FILE:-}" ]; then
    local mode; mode=$(stat -f '%Lp' "$NEVOUT_BACKUP_DB_URL_FILE" 2>/dev/null || stat -c '%a' "$NEVOUT_BACKUP_DB_URL_FILE")
    [ "$mode" = "600" ] || [ "$mode" = "400" ] || { echo "NEVOUT_BACKUP_DB_URL_FILE must be chmod 600" >&2; return 78; }
    tr -d '\n' < "$NEVOUT_BACKUP_DB_URL_FILE"
  else
    printf '%s' "${NEVOUT_BACKUP_DB_URL:-}"
  fi
}

# Which engine dumps the database:
#   pg            pg_dump/psql with a connection string (native if >= 17, else the Supabase Postgres image via Docker)
#   supabase-cli  `supabase db dump --linked` (uses the CLI login; no DB password on disk)
nv_engine() {
  case "$NEVOUT_BACKUP_ENGINE" in
    pg|supabase-cli) echo "$NEVOUT_BACKUP_ENGINE" ;;
    auto) if [ -n "$(nv_db_url)" ]; then echo pg; elif command -v supabase >/dev/null 2>&1; then echo supabase-cli; else echo none; fi ;;
    *) echo none ;;
  esac
}

# Runs a PostgreSQL client tool (pg_dump or psql). Native binaries are used when
# their major version is >= 17 (production runs 17); otherwise the same Supabase
# Postgres image the local stack uses. Localhost URLs are rewritten for Docker.
nv_pg() {
  local tool="$1"; shift
  if command -v "$tool" >/dev/null 2>&1 && [ "$("$tool" --version | sed -E 's/.* ([0-9]+)\..*/\1/')" -ge 17 ]; then
    "$tool" "$@"
  else
    local args=() a
    for a in "$@"; do args+=("$(printf '%s' "$a" | sed -E 's#@(127\.0\.0\.1|localhost)([:/])#@host.docker.internal\2#')"); done
    docker run --rm -i --add-host=host.docker.internal:host-gateway -e PGCONNECT_TIMEOUT=15 --entrypoint "$tool" "$NEVOUT_PG_IMAGE" "${args[@]}"
  fi
}

# Runs a SQL file that returns one text value, against a connection string or the linked project.
#   nv_sql_value <file> <db-url|--linked>
nv_sql_value() {
  local file="$1" target="$2"
  if [ "$target" = "--linked" ]; then
    (cd "$NV_REPO_ROOT" && supabase db query --linked --agent=no -o json -f "$file" 2>/dev/null) | node -e '
      let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
        const rows = JSON.parse(s); const r = Array.isArray(rows) ? rows[rows.length - 1] : rows;
        const v = r && typeof r === "object" ? Object.values(r)[0] : r; process.stdout.write(typeof v === "string" ? v : JSON.stringify(v)); });'
  else
    nv_pg psql "$target" -X -q -A -t -v ON_ERROR_STOP=1 < "$file" | grep -v '^$' | tail -1
  fi
}

nv_encrypt() { node "$NV_BACKUP_HOME/nvcrypt.mjs" encrypt "$1" "$2"; }
nv_decrypt() { node "$NV_BACKUP_HOME/nvcrypt.mjs" decrypt "$1" "$2"; }

# Copies an artifact (and its .meta.json) to the configured destination.
#   NEVOUT_BACKUP_DEST = local | dir:/mounted/path | s3 | rclone:<remote>:<path>
nv_upload() {
  local file="$1" key="$2"
  case "$NEVOUT_BACKUP_DEST" in
    local) return 0 ;;
    dir:*) local d="${NEVOUT_BACKUP_DEST#dir:}"; mkdir -p "$d/$(dirname "$key")"; cp "$file" "$d/$key"; chmod 600 "$d/$key"
           [ "$(nv_size "$d/$key")" = "$(nv_size "$file")" ] || { echo "copy to $d/$key incomplete" >&2; return 1; } ;;
    s3) node "$NV_BACKUP_HOME/s3.mjs" put "$file" "$key" ;;
    rclone:*) command -v rclone >/dev/null || { echo "rclone not installed" >&2; return 1; }
              rclone copyto "$file" "${NEVOUT_BACKUP_DEST#rclone:}/$key" ;;
    *) echo "unknown NEVOUT_BACKUP_DEST: $NEVOUT_BACKUP_DEST" >&2; return 1 ;;
  esac
}

# Deletes artifacts older than NEVOUT_BACKUP_RETENTION_DAYS, always keeping the
# newest NEVOUT_BACKUP_KEEP_MIN of each kind. Artifact names carry their UTC
# timestamp, so age is taken from the name, not from file times.
#   nv_prune <kind>   (db | storage)
nv_prune() {
  local kind="$1" cutoff; cutoff=$(node -e "const d=new Date(Date.now()-${NEVOUT_BACKUP_RETENTION_DAYS}*864e5);process.stdout.write(d.toISOString().replace(/[-:]|\.\d{3}/g,''))")
  local pattern="nevoutmeds-${kind}-${NEVOUT_BACKUP_PROJECT}-"
  _nv_old() { sort -r | awk -v keep="$NEVOUT_BACKUP_KEEP_MIN" -v cutoff="$cutoff" -v pat="$pattern" '
      { n = $0; sub(/.*\//, "", n); if (index(n, pat) != 1) next; ts = substr(n, length(pat) + 1, 16); seen++;
        if (seen > keep && ts < cutoff) print $0 }'; }
  local f removed=0
  for f in $(ls "$NEVOUT_BACKUP_DIR" 2>/dev/null | grep "^${pattern}.*\.enc$" | _nv_old); do
    rm -f "$NEVOUT_BACKUP_DIR/$f" "$NEVOUT_BACKUP_DIR/${f%.tar.gz.enc}.meta.json"; removed=$((removed + 1))
  done
  if [ "$NEVOUT_BACKUP_DEST" = "s3" ]; then
    for f in $(node "$NV_BACKUP_HOME/s3.mjs" list "$kind/" | cut -f1 | grep '\.enc$' | _nv_old); do
      node "$NV_BACKUP_HOME/s3.mjs" delete "$f"; node "$NV_BACKUP_HOME/s3.mjs" delete "${f%.tar.gz.enc}.meta.json"; removed=$((removed + 1))
    done
  fi
  echo "$removed"
}

nv_heartbeat() {
  local out rc=0
  out=$(node "$NV_BACKUP_HOME/heartbeat.mjs" "$1" 2>&1) || rc=$?
  case $rc in
    0) nv_log info heartbeat_recorded ;;
    3) nv_log warn heartbeat_not_configured "note=set NEVOUT_SUPABASE_URL and NEVOUT_SERVICE_ROLE_KEY_FILE so ops_health can see backups" ;;
    *) nv_log warn heartbeat_failed "error=$out" ;;
  esac
}
