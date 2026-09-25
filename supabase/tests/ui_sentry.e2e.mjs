// NevOut Meds — Sentry in a real browser, against a MOCK ingest server (Phase 11).
//
// The app is built with VITE_SENTRY_DSN pointing at 127.0.0.1:${MOCK_PORT}; this
// suite plays Sentry's ingest endpoint, records every envelope, and checks:
//   * real failures arrive, scrubbed (no email, phone, token, customer data, user);
//   * expected behaviour (wrong password, wrong code, refusals) is never sent;
//   * the app keeps working when the endpoint is down or the device is offline;
//   * no Replay / session recording code ships at all.
//
// Usage (LOCAL stack, after seed_e2e.sh):
//   APP_BASE=http://127.0.0.1:4186 SENTRY_DIST=<dist dir> CHROME=<path> UDD=<dir> OUT=<dir> node supabase/tests/ui_sentry.e2e.mjs
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { IDS, browser, reporter, sleep } from "./lib/harness.mjs";
import { completeMfaInPage } from "./lib/mfa.mjs";

const MOCK_PORT = Number(process.env.SENTRY_MOCK_PORT || 4191);
const OUT = process.env.OUT || "/tmp/nv-sentry";
const DIST = process.env.SENTRY_DIST;
const { check, done } = reporter();

// ── the mock ingest endpoint ────────────────────────────────────────────────
let envelopes = [];
let server;
function startMock() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const lines = raw.split("\n").filter(Boolean);
        const items = [];
        for (let i = 1; i + 1 < lines.length; i += 2) {
          try { items.push({ header: JSON.parse(lines[i]), payload: JSON.parse(lines[i + 1]) }); } catch { /* binary/other */ }
        }
        envelopes.push({ url: req.url, headers: req.headers, raw, items });
        res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" });
        res.end("{}");
      });
    });
    server.listen(MOCK_PORT, "127.0.0.1", resolve);
  });
}
const stopMock = () => new Promise((r) => (server ? server.close(() => r()) : r()));
const events = () => envelopes.flatMap((e) => e.items.filter((i) => i.header.type === "event").map((i) => i.payload));
async function waitForEvents(n, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (events().length >= n) return true; await sleep(250); }
  return events().length >= n;
}

await startMock();
const b = await browser({ port: 9401, out: OUT });
await b.viewport("laptop");
await b.reset();

// Give the SDK its idle moment to load.
await b.go("/login", 3000);
await sleep(6000);
const sdkLoaded = await b.ev(`performance.getEntriesByType('resource').some(r => /assets\\/sentry-/.test(r.name))`);
check("the monitoring SDK loads lazily in its own chunk", sdkLoaded === true, String(sdkLoaded));

// 1. An uncaught error carrying personal data.
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlLXZhbHVl";
await b.ev(`setTimeout(() => { throw new Error("Receipt for Musu Kollie musu.kollie@example.com +231 77 123 4567 token ${JWT}"); }, 0); 1`);
check("an uncaught error reaches the (mock) ingest endpoint", await waitForEvents(1), `${events().length} events`);
const e1 = events()[0] ?? {};
const e1s = JSON.stringify(e1);
check("the report keeps the error, not the person: no email", !/musu\.kollie@example\.com/.test(e1s), (e1.exception?.values?.[0]?.value ?? "").slice(0, 120));
check("no phone number in the report", !/77 123 4567|231 77/.test(e1s));
check("no token in the report", !e1s.includes("eyJ"));
check("no user object in the report", e1.user === undefined || Object.keys(e1.user ?? {}).length === 0, JSON.stringify(e1.user ?? null));
check("no breadcrumbs in the report", !e1.breadcrumbs || e1.breadcrumbs.length === 0, `${e1.breadcrumbs?.length ?? 0}`);
check("no request headers or cookies in the report", !e1.request?.headers && !e1.request?.cookies, JSON.stringify(e1.request ?? {}).slice(0, 120));
check("the report is tagged with release context, not identity", e1.tags?.app === "nevout-meds" && !/@/.test(JSON.stringify(e1.tags ?? {})), JSON.stringify(e1.tags ?? {}));
check("sendDefaultPii equivalent: no IP address is attached by the SDK", !e1s.includes("ip_address"), "");

// 2. An unhandled promise rejection.
await b.ev(`Promise.reject(new Error("worker crashed while pricing sb_secret_abcdefghijklmnop")); 1`);
check("an unhandled promise rejection is reported", await waitForEvents(2), `${events().length} events`);
check("secrets in a rejection are scrubbed", !/sb_secret_/.test(JSON.stringify(events()[1] ?? {})));

// 3. Expected behaviour is never sent.
const before = events().length;
await b.ev(`Promise.reject(Object.assign(new Error("Invalid login credentials"), { name: "AuthApiError", status: 400 })); 1`);
await b.ev(`Promise.reject(Object.assign(new Error("Invalid TOTP code entered"), { name: "AuthApiError", status: 422, code: "mfa_verification_failed" })); 1`);
await b.ev(`Promise.reject(Object.assign(new Error("only the pharmacy owner can invite staff"), { code: "42501" })); 1`);
await b.click(`document.querySelector('input[type=email]')`); await b.type("ownerA@e2e.local");
await b.click(`document.querySelector('input[type=password]')`); await b.type("definitely-wrong-password");
await b.press("Enter");
await sleep(4000);
check("wrong password, wrong code and permission refusals are not reported", events().length === before, `${events().length - before} extra`);

// 4. Signed-in context is pseudonymous.
await b.signIn("ownerA@e2e.local");
await sleep(2500);
await b.ev(`setTimeout(() => { throw new Error("render bug in stock meter"); }, 0); 1`);
check("errors inside the workspace are reported", await waitForEvents(before + 1), `${events().length}`);
const e4 = events().at(-1) ?? {};
const tags = e4.tags ?? {};
check("the workspace report carries route and role, and a pseudonymous tenant", tags.route && tags.role === "owner" && /^[0-9a-f]{12}$/.test(String(tags.tenant ?? "")), JSON.stringify(tags));
check("the tenant tag is not the pharmacy id", !JSON.stringify(e4).includes(IDS.pharmacyA));
check("the owner's email appears nowhere", !JSON.stringify(e4).includes("ownerA@e2e.local"));

// 5. Monitoring down: the app does not care.
await stopMock();
envelopes = [];
await b.ev(`setTimeout(() => { throw new Error("error while the endpoint is down"); }, 0); 1`);
await sleep(1500);
await b.open("inventory");
const invOk = await b.waitFor(`document.querySelectorAll('.nv-row__main').length > 0`, 12000);
check("with the monitoring endpoint down, the workspace keeps working", invOk, invOk ? "inventory rows" : (await b.mainText()).slice(0, 100));
await b.open("sales");
check("…and the sale screen opens", await b.waitFor(`!!document.querySelector('input[placeholder="Search products"]')`, 10000), "");

// 6. Fresh start with monitoring unreachable from the first request.
await b.reset();
await b.go("/login", 3000);
await b.signIn("staffA@e2e.local");
const staffOk = await b.waitFor(`!!document.querySelector('[data-nav-id]')`, 12000);
check("startup and sign-in work with the monitoring endpoint unreachable", staffOk, "");

// 7. Offline: the cached app opens and errors are simply not sent.
await b.offline(true);
await b.go("/platform", 5000);
const offlineShell = await b.waitFor(`!!document.querySelector('[data-nav-id]')`, 12000);
await b.ev(`setTimeout(() => { throw new Error("offline error"); }, 0); 1`);
await sleep(1500);
check("offline, the workspace still opens with monitoring configured", offlineShell, "");
check("offline, nothing is sent", envelopes.length === 0, `${envelopes.length}`);
await b.offline(false);

// 8. No session replay code ships.
if (DIST) {
  const assets = fs.readdirSync(path.join(DIST, "assets")).filter((f) => f.endsWith(".js"));
  // Recording code, not the core SDK's envelope type names (e.g. "replay_event").
  const hits = assets.filter((f) => /rrweb|ReplayContainer|recordingMode|replaysSessionSampleRate|maskAllText|blockAllMedia/.test(fs.readFileSync(path.join(DIST, "assets", f), "utf8")));
  check("no Replay / DOM-recording code in any shipped chunk", hits.length === 0, hits.join(", "));
  const sw = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
  check("the monitoring chunk is not precached by the service worker", !/assets\/sentry-/.test(sw), "");
  const all = assets.map((f) => fs.readFileSync(path.join(DIST, "assets", f), "utf8")).join("\n");
  check("no Sentry auth token in the bundle", !/sntrys_|SENTRY_AUTH_TOKEN/.test(all), "");
  check("no source maps are published", !fs.readdirSync(path.join(DIST, "assets")).some((f) => f.endsWith(".map")), "");
}

b.close();
process.exit(done("Sentry browser checks") ? 1 : 0);
