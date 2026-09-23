#!/usr/bin/env node
// Records one backup run in private.backup_runs via public.ops_record_backup_run
// (migration 0019), so ops_health / the health check can alert on stale or
// failed backups.
//   node heartbeat.mjs '<json: kind,status,started_at,artifact,bytes,sha256,destination,host,detail>'
// Exit 0 on success, 3 if the heartbeat is not configured (NEVOUT_SUPABASE_URL /
// service key missing), 1 on error. The backup scripts treat 3 as a warning.
import { client } from "./supabase-admin.mjs";

let run;
try { run = JSON.parse(process.argv[2] ?? ""); } catch { console.error("heartbeat: argument must be JSON"); process.exit(64); }
if (!process.env.NEVOUT_SUPABASE_URL || !(process.env.NEVOUT_SERVICE_ROLE_KEY_FILE || process.env.NEVOUT_SERVICE_ROLE_KEY)) {
  console.error("heartbeat: not configured (NEVOUT_SUPABASE_URL + NEVOUT_SERVICE_ROLE_KEY_FILE) — run not recorded in the database");
  process.exit(3);
}
try {
  const id = await client().call("POST", "/rest/v1/rpc/ops_record_backup_run", { body: { p_run: run } });
  console.log(`heartbeat recorded (#${id})`);
} catch (e) {
  console.error(`heartbeat: ${e.message}`);
  process.exit(1);
}
