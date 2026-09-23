# ops/: operator tooling

These scripts run on an **operator machine or a scheduled job**, never in the browser. They use
the Supabase **service-role key** and/or the **database connection string**. Both are read from
`chmod 600` files and are never taken from command-line arguments, printed or committed.

| Folder | What | Docs |
|---|---|---|
| `backup/` | Independent encrypted logical backups (database + Storage), off-site copy, retention, restore with validation | [docs/BACKUP_AND_RECOVERY.md](../docs/BACKUP_AND_RECOVERY.md) |
| `monitor/` | Health check: site, API, Edge Function, backups, errors, sync conflicts, integrity | [docs/MONITORING.md](../docs/MONITORING.md) |
| `provision/` | Controlled-pilot account provisioning without email (owner or invited staff) | [docs/STAFF_AUTH_ARCHITECTURE.md](../docs/STAFF_AUTH_ARCHITECTURE.md) |

## Requirements

- **Node.js ≥ 18.** Encryption, S3 and all HTTP calls use only Node built-ins; there are no npm
  dependencies.
- **bash, tar, gzip, shasum.** These come with macOS and Linux.
- **A database dump engine**, one of:
  - `pg_dump` / `psql` **17+** installed natively; or
  - Docker (the scripts use `public.ecr.aws/supabase/postgres:17.6.1.166`); or
  - the Supabase CLI logged in and linked (`NEVOUT_BACKUP_ENGINE=supabase-cli`).

## Quick reference

```bash
cp ops/backup/backup.env.example ops/backup/backup.env && chmod 600 ops/backup/backup.env   # then edit
ops/backup/backup-db.sh                  # encrypted DB backup → local dir (+ off-site if configured)
ops/backup/backup-storage.sh             # encrypted Storage backup (documents)
ops/backup/verify-backup.sh <artifact>   # prove an artifact decrypts and matches its checksums
ops/backup/restore-db.sh <artifact> --target-url <NEW empty Supabase DB URL>
ops/backup/restore-storage.sh <artifact> # target: NEVOUT_RESTORE_SUPABASE_URL (+ key file)
ops/backup/rehearse-local.sh <artifact>  # restore rehearsal into a fresh LOCAL database (dev machines)
node ops/monitor/health-check.mjs        # exit 0 healthy · 1 alerts · 2 could not check
node ops/provision/provision-owner.mjs --email … --name … --app-url https://nevout-meds-liberia-pilot.vercel.app [--for staff] --yes
```

## Suggested schedule (cron, UTC)

```cron
# Nightly database + storage backup, then a health check that alerts on failure.
15 2 * * *  cd /opt/nevoutmeds && ops/backup/backup-db.sh      >> /var/log/nevoutmeds-backup.cron 2>&1
30 2 * * *  cd /opt/nevoutmeds && ops/backup/backup-storage.sh >> /var/log/nevoutmeds-backup.cron 2>&1
0  * * * *  cd /opt/nevoutmeds && set -a && . ops/backup/backup.env && set +a && node ops/monitor/health-check.mjs >> /var/log/nevoutmeds-health.cron 2>&1
# Weekly: prove the newest backup still decrypts
0  4 * * 0  cd /opt/nevoutmeds && ops/backup/verify-backup.sh "$(ls -t /var/backups/nevoutmeds/nevoutmeds-db-*.enc | head -1)"
```

**The schedule and the backup host have not been set up yet. That is an operational task:** see
`PILOT_GO_LIVE_CHECKLIST.md`.
