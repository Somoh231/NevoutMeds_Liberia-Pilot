#!/usr/bin/env bash
# NevOut Meds — restore a Storage backup into a Supabase project.
#   restore-storage.sh <nevoutmeds-storage-*.tar.gz.enc> [--overwrite]
# Target: NEVOUT_RESTORE_SUPABASE_URL + NEVOUT_RESTORE_SERVICE_ROLE_KEY_FILE.
# Missing buckets are created with their recorded settings; every object is
# uploaded to its original path and re-downloaded to verify its SHA-256.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
nv_load_env
ART="${1:-}"; shift || true
[ -f "$ART" ] || { echo "usage: restore-storage.sh <artifact.tar.gz.enc> [--overwrite]" >&2; exit 64; }
[ -n "${NEVOUT_RESTORE_SUPABASE_URL:-}" ] || { echo "NEVOUT_RESTORE_SUPABASE_URL is required" >&2; exit 64; }
if [ "${NEVOUT_RESTORE_SUPABASE_URL%/}" = "${NEVOUT_SUPABASE_URL%/}" ] && [ "${1:-}" != "--overwrite" ]; then
  echo "note: restoring into the same project the backup came from; existing objects are kept (pass --overwrite to replace)" >&2
fi
WORK=$(mktemp -d); chmod 700 "$WORK"; trap 'rm -rf "$WORK"' EXIT
T0=$(nv_ms)
nv_decrypt "$ART" "$WORK/a.tar.gz"
mkdir -p "$WORK/x"; tar -xzf "$WORK/a.tar.gz" -C "$WORK/x"
RESULT=$(node "$NV_BACKUP_HOME/storage-import.mjs" "$WORK/x" "$@")
nv_log info storage_restore_validated "artifact=$(basename "$ART")" "result=$RESULT" "total_ms=$(( $(nv_ms) - T0 ))"
echo "$RESULT"
