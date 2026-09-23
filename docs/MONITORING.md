# Pilot monitoring

The monitoring is lightweight on purpose:
- one health-check script;
- one database function;
- the Supabase dashboard's own logs.

There's no observability stack to run. It's sized for a controlled pilot with a handful of
pharmacies.

## Signals and where they come from

| Signal | Source | How it reaches the operator |
|---|---|---|
| **App crashes** | The React error boundary writes `app_logs` (level `error`) | `ops_health().app_errors`; alert at ≥ 5 per window |
| **Offline sync conflicts** ("Needs attention" on a device) | The device writes `app_logs` `sync_conflict` (type, code, reason; never the payload) | `ops_health().sync.conflicts`; alert at ≥ 1 |
| **Repeated sync failures** | The device writes `sync_failed` after 3 server failures of the same change (network drops are not reported) | `ops_health().sync.failures`; alert at ≥ 3 |
| **Storage failures** | Document upload writes `storage_upload_failed` / `storage_metadata_failed` / `storage_cleanup_failed` | `ops_health().storage.failures_in_window`; alert at ≥ 1 |
| **Backup failures / stale backups** | `private.backup_runs` (heartbeat from the backup scripts) | Alert: no database backup ever; last one older than 26 h; storage objects with no storage backup in 26 h; any failed run |
| **Data integrity** | Negative stock, duplicate-looking sales, sales without a currency, stock ≠ Σ movements | `ops_health().integrity`; any non-zero value alerts |
| **Silent pharmacies** | No app events or sales for 48 h | `ops_health().activity.silent_48h` (listed, not an alert) |
| **Site / API / Edge Function down** | HTTP checks in `health-check.mjs` | Alert `CHECK: …` |
| **Auth failures** | Supabase auth logs (not in the database) | Dashboard → Logs (below) |
| **Edge Function errors** | Supabase function logs | Dashboard → Edge Functions → `staff-admin` → Logs (below) |
| **RPC / database errors** | Postgres logs; RPC errors surface to users and to `app_logs` when they break a sync | Dashboard → Logs → Postgres |

## The health check

```bash
set -a && . ops/backup/backup.env && set +a     # NEVOUT_SUPABASE_URL, NEVOUT_SERVICE_ROLE_KEY_FILE, NEVOUT_APP_URL
node ops/monitor/health-check.mjs               # human summary
node ops/monitor/health-check.mjs --json        # machine-readable
```

- **Exit codes:** `0` healthy, `1` alerts, `2` the check itself could not run.
- **Scheduling:** run hourly from cron or a CI schedule (`ops/README.md`). A non-zero exit is the
  alert.
- **Webhook (optional):** set `NEVOUT_ALERT_WEBHOOK_URL` to push alerts as JSON `{text, alerts}` to
  a Slack, Discord or Teams incoming webhook. **Not configured yet.**

`public.ops_health(p_hours)` can also be called directly by the platform admin (SQL editor, or
the RPC with an admin session). Pharmacy owners and staff get `forbidden`.

### Alert meanings and first action

| Alert | First action |
|---|---|
| `BACKUP: no successful database backup has ever been recorded` | The schedule isn't running, or the heartbeat isn't configured. See `docs/BACKUP_AND_RECOVERY.md` §7. |
| `BACKUP: last successful database backup is N hours old` | Check the backup host's cron log and `backup.log`. Run `ops/backup/backup-db.sh` by hand. |
| `BACKUP: a backup run failed in the window` | Read the `error` in `backup.log` or `private.backup_runs.detail`. Fix it, then rerun. |
| `INTEGRITY: …` | Treat as a potential data incident. Runbook → "The stock number looks wrong" / duplicates. |
| `APP: N client errors` | `select message, count(*) from app_logs where created_at > now()-interval '24 hours' and level='error' group by 1 order by 2 desc;` |
| `SYNC: N change(s) need attention` | Contact the pharmacy. The device shows the server's reason; runbook → sync conflicts. |
| `SYNC: N repeated sync failures` | Usually a server-side rejection loop. Check Postgres logs around those times. |
| `STORAGE: …` | Dashboard → Storage logs. Ask the pharmacy which document failed. |
| `CHECK: site / supabase api / edge function …` | The Vercel deployment, the Supabase status page, and the `staff-admin` logs. |

## Supabase dashboard log queries (Logs → Explorer)

**Auth failures** (wrong passwords, rate limits, banned users):

```sql
select timestamp, event_message
from auth_logs
where regexp_contains(event_message, '"status":4[0-9][0-9]')
order by timestamp desc
limit 100
```

**Edge Function errors:**

```sql
select timestamp, event_message
from function_edge_logs
where regexp_contains(event_message, 'staff-admin') and regexp_contains(event_message, '"status":5[0-9][0-9]')
order by timestamp desc
limit 100
```

**Database errors:**

```sql
select timestamp, event_message
from postgres_logs
where regexp_contains(event_message, 'ERROR')
order by timestamp desc
limit 100
```

If those log schemas change, use the dashboard's built-in filters instead: Auth → Logs,
Edge Functions → Logs, Database → Logs. The queries above aren't part of any automated check.

## Privacy

Telemetry never includes sale lines, customer names, phone numbers or document contents. Sync
reports carry only:
- the mutation type;
- the server's error code;
- a truncated reason, for example "insufficient stock for Paracetamol".

Only the pharmacy itself (RLS) and the platform admin can read `app_logs`.
