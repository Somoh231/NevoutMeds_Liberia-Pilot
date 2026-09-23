#!/usr/bin/env node
// NevOut Meds pilot health check — run on a schedule (cron / CI) by the operator.
//
//   node ops/monitor/health-check.mjs [--json] [--hours 24]
//
// Checks, in order:
//   1. the production site answers (/, /manifest.webmanifest, /sw.js)
//   2. the Supabase API answers
//   3. the staff-admin Edge Function answers (CORS preflight)
//   4. public.ops_health(): backups, client errors, sync conflicts/failures,
//      storage failures, integrity invariants, silent pharmacies — with alerts
// Exit: 0 = healthy, 1 = at least one alert, 2 = the check itself could not run.
//
// Env: NEVOUT_APP_URL (e.g. https://nevout-meds-liberia-pilot.vercel.app),
//      NEVOUT_SUPABASE_URL, NEVOUT_SERVICE_ROLE_KEY_FILE (or NEVOUT_SERVICE_ROLE_KEY),
//      NEVOUT_ALERT_WEBHOOK_URL (optional: alerts are POSTed as JSON {text, alerts}
//      to this URL — e.g. a Slack/Discord/Teams incoming webhook; not configured by default).
// Auth failures and Edge Function error logs live in Supabase's log store, not
// the database; see docs/MONITORING.md for the Log Explorer queries.
import { client } from "../backup/supabase-admin.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const hours = Number(args[args.indexOf("--hours") + 1]) || 24;
const alerts = [];
const checks = [];
const timed = async (name, fn) => {
  const t0 = Date.now();
  try { const detail = await fn(); checks.push({ name, ok: true, ms: Date.now() - t0, detail }); }
  catch (e) { checks.push({ name, ok: false, ms: Date.now() - t0, detail: e.message }); alerts.push(`CHECK: ${name} — ${e.message}`); }
};

let report;
try {
  const app = (process.env.NEVOUT_APP_URL || "").replace(/\/$/, "");
  const { base, call } = client();
  if (app) {
    for (const p of ["/", "/manifest.webmanifest", "/sw.js"]) {
      await timed(`site ${p}`, async () => {
        const r = await fetch(app + p, { redirect: "manual" });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        return r.status;
      });
    }
  } else {
    checks.push({ name: "site", ok: true, detail: "skipped (NEVOUT_APP_URL not set)" });
  }
  await timed("supabase api", async () => {
    const r = await call("GET", "/rest/v1/", { raw: true });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.status;
  });
  await timed("edge function staff-admin", async () => {
    const r = await fetch(`${base}/functions/v1/staff-admin`, { method: "OPTIONS", headers: { Origin: app || "https://example.invalid", "Access-Control-Request-Method": "POST" } });
    if (r.status >= 500 || r.status === 404) throw new Error(`HTTP ${r.status}`);
    return r.status;
  });
  let health = null;
  await timed("ops_health", async () => {
    health = await call("POST", "/rest/v1/rpc/ops_health", { body: { p_hours: hours } });
    return "ok";
  });
  if (health) alerts.push(...health.alerts);
  report = { generated_at: new Date().toISOString(), healthy: alerts.length === 0, alerts, checks, health };
} catch (e) {
  console.error(`health-check could not run: ${e.message}`);
  process.exit(2);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`NevOut Meds health — ${report.healthy ? "HEALTHY" : `${alerts.length} ALERT(S)`} (${report.generated_at})`);
  for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ms !== undefined ? ` (${c.ms} ms)` : ""}${c.ok ? "" : ` — ${c.detail}`}`);
  const h = report.health;
  if (h) {
    const b = h.backups;
    console.log(`  backups: database ${b.database.age_hours ?? "never"} h ago · storage ${b.storage.age_hours ?? "never"} h ago`);
    console.log(`  last ${h.window_hours} h: client errors ${h.app_errors.total} · sync conflicts ${h.sync.conflicts} · sync failures ${h.sync.failures} · storage failures ${h.storage.failures_in_window}`);
    console.log(`  integrity: negative stock ${h.integrity.negative_stock} · duplicate sales ${h.integrity.duplicate_purchases} · unstamped sales ${h.integrity.unstamped_sales} · stock≠movements ${h.integrity.stock_movement_mismatch}`);
    console.log(`  pharmacies: ${h.activity.pharmacies} (silent 48 h: ${h.activity.silent_48h.length ? h.activity.silent_48h.join(", ") : "none"})`);
  }
  for (const a of alerts) console.log(`  ALERT ${a}`);
}

if (alerts.length && process.env.NEVOUT_ALERT_WEBHOOK_URL) {
  try {
    await fetch(process.env.NEVOUT_ALERT_WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `NevOut Meds: ${alerts.length} alert(s)\n${alerts.map((a) => `• ${a}`).join("\n")}`, alerts })
    });
  } catch (e) {
    console.error(`alert webhook failed: ${e.message}`);
  }
}
process.exit(alerts.length ? 1 : 0);
