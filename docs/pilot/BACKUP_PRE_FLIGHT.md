# Backup pre-flight: hard gate before any real data

**No real pharmacy, customer or patient record may be created in production until every box
below is ticked and signed.**

Supabase Pro / managed backups are **not** required for this controlled pilot under the current
policy. This independent backup **is** required.

Tooling and detail: [`ops/README.md`](../../ops/README.md) and
[docs/BACKUP_AND_RECOVERY.md](../BACKUP_AND_RECOVERY.md). The tooling was already verified
against production on 2026-09-23 (§6 there). This gate is about the **operating** setup, not
that verification run.

## Checklist

- [ ] **1. Backup owner named** (`docs/PILOT_INCIDENT_RUNBOOK.md`): __________
- [ ] **2. Backup machine chosen:** an always-on machine or server that is **not** the
      engineer's laptop. Host: __________
- [ ] **3. `ops/backup/backup.env` created on it,** mode `600`, from `backup.env.example`:
  - `NEVOUT_BACKUP_PROJECT=prod`, the retention settings and `NEVOUT_BACKUP_DIR`;
  - engine: `pg` with `NEVOUT_BACKUP_DB_URL_FILE` (chmod 600), or `supabase-cli` logged in;
  - `NEVOUT_SUPABASE_URL` and `NEVOUT_SERVICE_ROLE_KEY_FILE` (chmod 600), for Storage backups
    and the heartbeat.
- [ ] **4. Encryption configured:** `NEVOUT_BACKUP_PASSPHRASE_FILE`, chmod 600, 20+ random
      characters. **A second copy of the passphrase is stored offline** (password manager or
      sealed envelope) by the Backup Owner. Where: __________
- [ ] **5. Off-site destination configured:**
  - `NEVOUT_BACKUP_DEST=s3` (R2 / B2 / S3 / other) or `rclone:`, **not** `local`;
  - the key can only reach the backup bucket;
  - versioning or object lock is on, if the provider offers it.
  - Destination: __________
- [ ] **6. Schedule active** (cron or systemd), as in `ops/README.md`:
  - nightly `backup-db.sh`;
  - nightly `backup-storage.sh`;
  - hourly `health-check.mjs`;
  - weekly `verify-backup.sh`.
  Paste `crontab -l` here: __________
- [ ] **7. First scheduled backup succeeded.** The run came **from the schedule**, not by hand:
  - backup log `backup_succeeded` for **both** database and storage;
  - the artifact is present **at the off-site destination**;
  - the health check shows backup age < 26 h.
  - Artifact names: __________
- [ ] **8. Restore from that scheduled backup succeeded:**
  - download the artifact **from the off-site destination**;
  - on a machine with Docker and the local stack, run
    `ops/backup/rehearse-local.sh <artifact>` (or `restore-db.sh` into the staging project);
  - the result must be `"ok":true`: tables, rows and schema objects all equal.
  - Measured restore time: ______ · Date: ______
- [ ] **9. Alerting reaches a person:** `NEVOUT_ALERT_WEBHOOK_URL` is set, or a named person reads
      the hourly health-check output every day. Who / where: __________
- [ ] **10. Re-verified within the last 7 days** before onboarding. If more than 7 days have
      passed since item 8, repeat items 7–8.

## Sign-off

| | Name | Date |
|---|---|---|
| Backup Owner | | |
| Incident Owner | | |

☐ **Pre-flight complete. Real pilot data may be entered.**
