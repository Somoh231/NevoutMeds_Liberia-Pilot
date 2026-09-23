# NevOut Meds: backup and recovery

## Pilot policy

| Item | Status |
|---|---|
| **Independent logical backup** (this document) | **BUILT and REHEARSED.** It **must be scheduled and restore-tested against production before any real pharmacy or patient data is entered.** |
| Managed Supabase backups / PITR (Pro plan) | **DEFERRED** until the controlled pilot begins or paying customers join. `supabase backups list` (2026-09-23): no backups, PITR off. |
| Backup owner | **TBD** |
| Off-site destination | **Not chosen yet.** The tooling supports any S3-compatible store (AWS S3, Cloudflare R2, Backblaze B2, MinIO), a mounted disk, or rclone. |

**A logical backup is not point-in-time recovery.** A nightly logical backup restores the database
as it was at the last run. Anything written after that exists only on the devices that recorded it
and in their offline queues.

---

## 1. What is backed up, and what is not

| Data | Database backup (`backup-db.sh`) | Storage backup (`backup-storage.sh`) |
|---|---|---|
| All pharmacy data (`public`: sales, stock, movements, customers, suppliers, orders, audit logs…) | ✅ schema + rows | — |
| `private` schema: country registry, backup heartbeat, helper functions | ✅ | — |
| RLS policies, functions/RPCs, triggers, constraints, grants | ✅ (schema) | — |
| Which migrations are applied (`supabase_migrations.schema_migrations`) | ✅ | — |
| Auth accounts: `auth.users`, `auth.identities` (password hashes, confirmation state) | ✅ | — |
| Auth sessions, refresh tokens, one-time tokens, auth audit log | ❌ **excluded on purpose.** These are bearer-like secrets. After a restore, everyone signs in again. | — |
| **Uploaded documents** (Storage objects, all buckets) | ❌ **database dumps do not contain files** | ✅ files + tenant paths + content types + SHA-256 + bucket settings |
| Auth settings (Site URL, redirect allow-list, SMTP, templates) | ❌ | ❌: re-apply from `docs/PRODUCTION_DEPLOYMENT.md` |
| Edge Function code | ❌ | ❌: it is in this repository |
| Edge Function secrets, Vercel env vars | ❌ | ❌: re-enter from the owner's secret store |
| Supabase platform settings (plan, network, logs) | ❌ | ❌ |

**Supabase-specific limitations:**
- The `auth`, `storage`, `realtime` and `extensions` schemas are **platform-managed**. The backup
  takes only the auth rows it needs; a new project provides the rest.
- Default privileges `FOR ROLE supabase_admin` belong to the platform and are not restored.
- Postgres roles and passwords are platform-managed and not included.

## 2. Artifact format

```
nevoutmeds-db-<project>-<UTC YYYYMMDDTHHMMSSZ>.tar.gz.enc        + .meta.json
nevoutmeds-storage-<project>-<UTC YYYYMMDDTHHMMSSZ>.tar.gz.enc   + .meta.json
```

- **Encryption.** `NVBK1` = AES-256-**GCM** with a key derived by scrypt (N=2^15, r=8, p=1) from
  the backup passphrase (`ops/backup/nvcrypt.mjs`). GCM authenticates the whole file: a wrong
  passphrase, truncation or a single flipped byte makes decryption fail. All three were tested.
- **Compression.** gzip inside the encryption.
- **Metadata.** `.meta.json` is unencrypted and contains no secrets or personal data: size,
  SHA-256 of the encrypted file, row counts per table, applied migrations, and the country-registry
  checksum.
- **Inside a database artifact:**
  - `schema.sql`
  - `data-app.sql`
  - `data-auth.sql`
  - `data-migrations.sql`
  - `source-manifest.json`: row counts, a schema fingerprint of columns, constraints, policies,
    function bodies, triggers, RLS flags and grants, plus the registry checksum and integrity
    invariants.
  - `manifest.json`: SHA-256 of every member file.
- **Logging.** Every run appends JSON lines to `$NEVOUT_BACKUP_DIR/backup.log` and records a row
  in `private.backup_runs` through the heartbeat. Any failure exits **non-zero** and records a
  failure heartbeat, which the health check turns into an alert.
- **Retention.** Delete after `NEVOUT_BACKUP_RETENTION_DAYS` (default 30), but always keep the
  newest `NEVOUT_BACKUP_KEEP_MIN` (default 7) of each kind. This applies locally and on S3.
  Consider bucket object-lock or versioning at the destination as well.

## 3. Configuration

Copy `ops/backup/backup.env.example` → `ops/backup/backup.env` and `chmod 600` it (the scripts
refuse looser permissions). Every secret is referenced by a `*_FILE` path.

| Setting | Purpose |
|---|---|
| `NEVOUT_BACKUP_PASSPHRASE_FILE` | **Required.** Keep an offline copy, or no backup can ever be restored. |
| `NEVOUT_BACKUP_DB_URL_FILE` | Supabase → Connect → Session pooler connection string. Alternatively, `NEVOUT_BACKUP_ENGINE=supabase-cli` uses the CLI login instead. |
| `NEVOUT_SUPABASE_URL`, `NEVOUT_SERVICE_ROLE_KEY_FILE` | The heartbeat and the Storage backup. |
| `NEVOUT_BACKUP_DEST` | `local` · `dir:/path` · `s3` · `rclone:<remote>:<path>` |
| `NEVOUT_BACKUP_S3_*` | Endpoint, bucket, region, access key id, secret key **file**, prefix. Any S3-compatible vendor works. |

**Least privilege at the destination:**
- Give the backup key access to **one bucket** only: write, list, and delete (delete is used for
  retention only).
- Where the vendor supports it, enable versioning or object lock so a compromised backup host
  can't erase history.

## 4. Restore rehearsal: measured 2026-09-23 (synthetic data)

**Source.** The local Supabase stack with a synthetic multi-country dataset: 12 pharmacies (LR,
GH, KE, RW, SL, NG, GM), 480+ sales in 6 currencies, customers, products, stock movements,
suppliers, orders, 13 auth users and 19 documents. All of it was created through the app's own
RPCs.

**Target.** A **brand-new database** with only the Supabase baseline (auth schema, default
grants, extensions), which is what a new hosted project starts with. It was created by
`ops/backup/rehearse-local.sh`.

| Step | Result | Measured |
|---|---|---|
| Database backup (dump 4 files, manifest, gzip, encrypt, decrypt-verify, heartbeat) | ✅ 156 KB encrypted | **2.6–2.8 s** |
| Restore: decrypt and verify member checksums | ✅ | 0.74 s |
| Restore: schema from the backup | ✅ | 1.80 s |
| Restore: data | ✅ | 0.42 s |
| Restore: validation (manifest compare + functional check) | ✅ | 1.49 s |
| **Restore total** | ✅ | **4.45 s** |
| Restore with schema from `supabase/migrations` instead | ✅ identical result | 9.09 s total |
| **Validation** | **25 tables, 2,326 rows: every count equal.** **547 schema objects identical** (columns, constraints, RLS policies, function bodies, triggers, RLS flags, grants). Country registry equal. Integrity invariants equal. **0 tables without RLS.** | |
| Functional check on the restored copy (rolled back) | Owner sees **1** pharmacy and **0** foreign sales. A sale records, stock **30 → 29**, stamped **USD**. | |
| Off-site (S3-compatible) | Uploaded, confirmed by read-back, listed. **Downloaded into an empty folder and verified independently.** | |
| Retention | Keep-min 2, retention 0 days, 3 runs → the oldest pruned **locally and remotely** | |
| Storage backup | 2 buckets, 23 objects, 316 KB | 2 s |
| Storage loss → restore | 19 documents deleted (0 left) → restored → **all 23 objects re-downloaded and SHA-256-verified**, paths and sizes identical | 1 s |
| Failure path | A failing run exited **1**, logged the error, and recorded a **failure** heartbeat. The health check raised `BACKUP: a backup run failed`. | |

**Defects the rehearsal caught and fixed:**
- **Restored copies had wider grants than production (63 vs 42).** Restoring onto a new project's
  default privileges would have given `anon` table privileges that production revoked. The
  restore now clears those defaults first, and the validation compares grants, so this can't
  recur silently.
- **The dump's `CREATE SCHEMA public`** conflicts with every Supabase project. The restore now uses
  `IF NOT EXISTS`.
- **Platform-owned default privileges** (`FOR ROLE supabase_admin`) can't be set by a restore, so
  they are skipped.

**What this proves:** the **logical-backup procedure**. It does not prove Supabase managed PITR,
which isn't enabled.

**Production:** see §6 for the production backup run and the restore rehearsal of its artifact.

## 5. Restore procedure (disaster)

1. **Declare the incident** (see `docs/PILOT_INCIDENT_RUNBOOK.md`). Stop writes if the source
   project is still reachable but corrupt.
2. **Create a NEW Supabase project.** Never restore over the damaged one while diagnosing.
3. `ops/backup/verify-backup.sh <newest db artifact>`.
4. `ops/backup/restore-db.sh <artifact> --target-url "<new project session-pooler URL>"`.
   - It refuses a target that already holds pharmacies, or one equal to the backup source.
   - It exits **non-zero** unless rows, schema, grants, registry, integrity and the functional
     check all match.
5. Set `NEVOUT_RESTORE_SUPABASE_URL` and `NEVOUT_RESTORE_SERVICE_ROLE_KEY_FILE` to the new
   project, then run `ops/backup/restore-storage.sh <newest storage artifact>`.
6. **Re-apply configuration** (`docs/PRODUCTION_DEPLOYMENT.md`):
   - auth Site URL and redirect allow-list;
   - SMTP (when available);
   - `supabase functions deploy staff-admin`;
   - Edge Function secrets.
7. **Point the frontend at the new project:** Vercel env `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`, then redeploy.
8. **Verify:**
   - `node ops/monitor/health-check.mjs`;
   - an owner signs in and sees their data;
   - one sale; confirm the stock moves;
   - a second pharmacy's data is not visible.
9. **Communicate:**
   - Every user must sign in again, because sessions aren't restored.
   - Devices with queued offline work sync it on reconnect. Idempotency keys prevent duplicates
     of anything the backup already contains.

**Expected RTO:** the database and storage steps take seconds at pilot data sizes (measured
above). The full-environment RTO is dominated by the manual steps 2, 6 and 7 and **has not been
measured**, because no new hosted project was created. Schedule that rehearsal once a staging
project exists (`STAGING_SETUP.md`).

**RPO:** equal to the backup interval, and **only once the schedule is running**. Until then it
is **unbounded**.

## 6. Production

First production run: **2026-09-23**, from the engineer's machine, `supabase-cli` engine,
destination `local`. **This was a tooling verification, not the operating backup.**
- The artifacts and their passphrase live only in a temporary session directory and **will not
  be kept**.
- Production held no tenant data at the time, so there was nothing to lose.

| Step | Result |
|---|---|
| Pre-migration backup (before applying `0019`) | `nevoutmeds-db-prod-20260923T173332Z`: **OK**, 65 KB encrypted, 139 s. Most of that time is the CLI's pg_dump container talking to the hosted DB. |
| `0019_ops_monitoring` applied | Dry-run, then push. `supabase migration list --linked` shows `0001`–`0019` on both sides. |
| Schema after migration | The production fingerprint (columns, constraints, policies, functions, triggers, RLS, grants) is **identical** to the tested local build. The country registry md5 is identical. 0 tables without RLS. |
| Post-migration DB backup | `nevoutmeds-db-prod-20260923T173956Z`: **OK**, 70.5 KB encrypted, 169 s. Heartbeat recorded. |
| Storage backup | `nevoutmeds-storage-prod-20260923T174246Z`: **OK**, 1 bucket (`documents`), 0 objects, 2 s. Heartbeat recorded. |
| `verify-backup.sh` | `ok:true`: 26 tables, 26 rows (7 country rules + 19 migrations), 19 migrations |
| Restore rehearsal of the **production** artifact into a fresh isolated DB | **OK in 2.2 s**: decrypt 0.6 s, schema 0.6 s, data 0.4 s, validation 0.6 s. 26/26 tables and 547/547 schema objects equal. Functional check skipped (no tenant data). Rehearsal DB dropped afterwards. |
| `ops_health` on production after the runs | **HEALTHY**. Backups 0 h old, 0 errors, 0 integrity violations. Before the runs it correctly alerted `BACKUP: no successful database backup has ever been recorded`. |
| Access control | Anonymous calls to `ops_health` / `ops_record_backup_run` are refused (`42501`), and `private.backup_runs` is not exposed over REST. |

**Consequence.** From about 26 h after this run, `ops_health` will raise `BACKUP … older than 26 h`
until the scheduled backup (§7) is running. **That alert is intended.**

## 7. Open items before real data

- [ ] **Backup owner** named (TBD).
- [ ] **Backup host** chosen and `backup.env` created there (`chmod 600`). The passphrase is
      stored offline as well.
- [ ] **Off-site destination** chosen (S3/R2/B2/other) with a least-privilege key. Versioning or
      object lock on, if available.
- [ ] **Schedule running**: nightly `backup-db.sh` and `backup-storage.sh`, an hourly health
      check, and a weekly `verify-backup.sh` (`ops/README.md`).
- [ ] **First production restore test** from the scheduled job's artifact, into the staging
      project or a local rehearsal database, passing `restore-db.sh` validation.
- [ ] Later: Supabase Pro backups / PITR (**deferred until the pilot or paid customers**).
