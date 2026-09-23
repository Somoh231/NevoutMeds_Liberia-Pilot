#!/usr/bin/env bash
# NevOut Meds — Supabase Storage backup (uploaded documents).
#
# Database dumps do NOT contain Storage files. This copies every object in every
# bucket, keeping bucket names and tenant paths (<pharmacy_id>/<file>) plus a
# manifest (bucket settings, content types, SHA-256), then packs, encrypts,
# verifies, uploads, prunes and records it exactly like backup-db.sh.
#   Produces $NEVOUT_BACKUP_DIR/nevoutmeds-storage-<project>-<UTC stamp>.tar.gz.enc (+ .meta.json)
# Needs: NEVOUT_SUPABASE_URL and NEVOUT_SERVICE_ROLE_KEY_FILE (service role: it reads every tenant's files).
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
nv_load_env

STARTED=$(nv_now); T0=$(nv_ms)
NAME="nevoutmeds-storage-${NEVOUT_BACKUP_PROJECT}-$(nv_stamp)"
WORK=$(mktemp -d); chmod 700 "$WORK"
cleanup() { rm -rf "$WORK"; }
fail() {
  nv_log error backup_failed "kind=storage" "artifact=$NAME" "error=$1"
  nv_heartbeat "$(node -e 'const [st,a,e,h,d]=process.argv.slice(1);process.stdout.write(JSON.stringify({kind:"storage",status:"failure",started_at:st,artifact:a,destination:d,host:h,detail:{error:e}}))' "$STARTED" "$NAME" "$1" "$(hostname)" "$NEVOUT_BACKUP_DEST")"
  cleanup; exit 1
}
trap 'fail "command failed at line $LINENO"' ERR
trap cleanup EXIT

nv_log info backup_started "kind=storage" "artifact=$NAME" "dest=$NEVOUT_BACKUP_DEST"
SUMMARY=$(node "$NV_BACKUP_HOME/storage-export.mjs" "$WORK/export") || fail "storage export failed"
tar -czf "$WORK/$NAME.tar.gz" -C "$WORK/export" .
OUT="$NEVOUT_BACKUP_DIR/$NAME.tar.gz.enc"
nv_encrypt "$WORK/$NAME.tar.gz" "$OUT" || fail "encryption failed"
nv_decrypt "$OUT" "$WORK/verify.tar.gz" || fail "the encrypted artifact could not be decrypted"
tar -tzf "$WORK/verify.tar.gz" | grep -q 'storage-manifest.json$' || fail "the decrypted artifact is incomplete"

BYTES=$(nv_size "$OUT"); SHA=$(nv_sha256 "$OUT")
node -e '
  const fs = require("fs"); const [out, name, bytes, sha, started, summary, project] = process.argv.slice(1);
  fs.writeFileSync(out, JSON.stringify({ artifact: name + ".tar.gz.enc", kind: "storage", project, created_at: new Date().toISOString(), started_at: started,
    bytes: Number(bytes), sha256: sha, encryption: "NVBK1 AES-256-GCM, scrypt(N=2^15,r=8,p=1)", contents: JSON.parse(summary) }, null, 2), { mode: 0o600 });
' "$NEVOUT_BACKUP_DIR/$NAME.meta.json" "$NAME" "$BYTES" "$SHA" "$STARTED" "$SUMMARY" "$NEVOUT_BACKUP_PROJECT"
nv_upload "$OUT" "storage/$NAME.tar.gz.enc" || fail "upload to $NEVOUT_BACKUP_DEST failed"
nv_upload "$NEVOUT_BACKUP_DIR/$NAME.meta.json" "storage/$NAME.meta.json" || fail "metadata upload failed"
PRUNED=$(nv_prune storage)
MS=$(( $(nv_ms) - T0 ))
nv_log info backup_succeeded "kind=storage" "artifact=$NAME.tar.gz.enc" "bytes=$BYTES" "sha256=$SHA" "contents=$SUMMARY" "dest=$NEVOUT_BACKUP_DEST" "duration_ms=$MS" "pruned=$PRUNED"
nv_heartbeat "$(node -e 'const [st,a,b,sh,d,h,ms,sum]=process.argv.slice(1);process.stdout.write(JSON.stringify({kind:"storage",status:"success",started_at:st,artifact:a,bytes:Number(b),sha256:sh,destination:d,host:h,detail:{duration_ms:Number(ms),...JSON.parse(sum)}}))' "$STARTED" "$NAME.tar.gz.enc" "$BYTES" "$SHA" "$NEVOUT_BACKUP_DEST" "$(hostname)" "$MS" "$SUMMARY")"
echo "$OUT"
