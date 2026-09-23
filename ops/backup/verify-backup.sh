#!/usr/bin/env bash
# NevOut Meds — check a backup artifact without restoring it: the passphrase
# decrypts it (GCM authentication proves it is unmodified), every member file
# matches the checksum recorded at backup time, and the metadata agrees.
#   verify-backup.sh <artifact.tar.gz.enc>
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
nv_load_env
ART="${1:-}"; [ -f "$ART" ] || { echo "usage: verify-backup.sh <artifact.tar.gz.enc>" >&2; exit 64; }
META="${ART%.tar.gz.enc}.meta.json"
WORK=$(mktemp -d); chmod 700 "$WORK"; trap 'rm -rf "$WORK"' EXIT
if [ -f "$META" ]; then
  [ "$(nv_sha256 "$ART")" = "$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sha256)' "$META")" ] \
    || { echo "FAIL: artifact checksum differs from $META" >&2; exit 1; }
fi
nv_decrypt "$ART" "$WORK/a.tar.gz"
mkdir -p "$WORK/x"; tar -xzf "$WORK/a.tar.gz" -C "$WORK/x"
node -e '
  const fs = require("fs"), crypto = require("crypto"), path = require("path"); const dir = process.argv[1];
  const h = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  if (fs.existsSync(path.join(dir, "manifest.json"))) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    for (const [f, e] of Object.entries(m.files)) if (h(path.join(dir, f)) !== e.sha256) { console.error("FAIL: " + f + " checksum"); process.exit(1); }
    const rows = Object.values(m.source.rows).reduce((a, b) => a + b, 0);
    console.log(JSON.stringify({ ok: true, kind: "database", artifact: m.artifact, tables: Object.keys(m.source.rows).length, rows, migrations: (m.source.migrations || []).length }));
  } else {
    const m = JSON.parse(fs.readFileSync(path.join(dir, "storage-manifest.json"), "utf8"));
    for (const o of m.objects) if (h(path.join(dir, "objects", o.bucket, ...o.path.split("/"))) !== o.sha256) { console.error("FAIL: " + o.bucket + "/" + o.path); process.exit(1); }
    console.log(JSON.stringify({ ok: true, kind: "storage", buckets: m.buckets.length, objects: m.objects.length }));
  }' "$WORK/x"
