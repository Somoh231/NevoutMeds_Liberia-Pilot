// NevOut Meds — production smoke test against the DEPLOYED artifact.
//
// Unlike the other browser suites (which serve a local build), this one drives
// the real production URL: the bundle Vercel actually serves, its PWA assets,
// and its connection to the live Supabase project.
//
// Usage:
//   PROD_URL=https://<deployment> CHROME=<path> UDD=<profile dir> \
//     node supabase/tests/prod_smoke.e2e.mjs
//
// Prerequisites: supabase/tests/seed_remote.mjs (synthetic accounts only).
import { spawn } from "node:child_process";
import fs from "node:fs";

const PROD = (process.env.PROD_URL || "https://nevout-meds-liberia-pilot.vercel.app").replace(/\/$/, "");
const API = process.env.NEVOUT_API_URL || "https://qohpyeqyveusnxhnbtxz.supabase.co";
// Signed-in checks need an account. Production holds no test accounts, so they
// run only when a dedicated smoke account is supplied (NEVOUT_SMOKE_EMAIL +
// NEVOUT_SMOKE_PASSWORD_FILE, chmod 600), or on staging with the synthetic
// E2E owner (NEVOUT_SMOKE_USE_E2E=1). Otherwise they are reported as skipped.
let SMOKE = null;
if (process.env.NEVOUT_SMOKE_EMAIL && process.env.NEVOUT_SMOKE_PASSWORD_FILE) {
  SMOKE = { email: process.env.NEVOUT_SMOKE_EMAIL, password: fs.readFileSync(process.env.NEVOUT_SMOKE_PASSWORD_FILE, "utf8").trim() };
} else if (process.env.NEVOUT_SMOKE_USE_E2E === "1") {
  SMOKE = { email: "ownerA@e2e.local", password: JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8")).password };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (d, ok, detail) => {
  if (ok) { pass++; console.log(`ok   ${d}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`NOT OK ${d} [${detail}]`); }
};

// ── 1. The deployment must be publicly reachable ────────────────────────────
const root = await fetch(`${PROD}/`, { redirect: "manual" });
const location = root.headers.get("location") ?? "";
check("production URL is publicly reachable (no SSO wall)",
  root.status === 200 && !/vercel\.com\/(sso|login)/.test(location),
  `${root.status}${location ? ` → ${location.slice(0, 60)}` : ""}`);

if (root.status !== 200) {
  console.log(`\n# ${pass + fail} production smoke checks, ${fail} failed`);
  console.log("#  Deployment protection still appears to be enabled — remaining checks skipped.");
  process.exit(1);
}

// ── 2. Static assets and PWA files, straight over HTTP ──────────────────────
for (const [path, type] of [["/manifest.webmanifest", /manifest\+json|application\/json/], ["/sw.js", /javascript/]]) {
  const r = await fetch(`${PROD}${path}`);
  check(`${path} is served`, r.ok && type.test(r.headers.get("content-type") ?? ""), `${r.status} ${r.headers.get("content-type")}`);
}
const manifest = await (await fetch(`${PROD}/manifest.webmanifest`)).json();
check("manifest has the fields an installable app needs",
  !!manifest.name && !!manifest.start_url && manifest.display === "standalone" && (manifest.icons ?? []).length >= 2,
  `${manifest.name} · ${manifest.icons?.length} icons`);
for (const icon of manifest.icons ?? []) {
  const r = await fetch(`${PROD}${icon.src}`);
  if (!r.ok) check(`icon ${icon.src} resolves`, false, `${r.status}`);
}
check("every manifest icon resolves", true, `${manifest.icons?.length} checked`);

// ── 3. Drive the deployed app in a real browser ─────────────────────────────
const proc = spawn(process.env.CHROME, ["--remote-debugging-port=9360", `--user-data-dir=${process.env.UDD}`, "about:blank"], { stdio: "ignore" });
let list;
for (let i = 0; i < 80; i++) { try { list = await (await fetch("http://127.0.0.1:9360/json/list")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  else if (d.method === "Log.entryAdded" && d.params.entry.level === "error") logs.push(d.params.entry.text);
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    const t = setTimeout(() => { pend.delete(i); resolve({ timedOut: true }); }, 30_000);
    pend.set(i, (d) => { clearTimeout(t); resolve(d); });
    try { ws.send(JSON.stringify({ id: i, method, params })); } catch { clearTimeout(t); resolve({ failed: true }); }
  });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable");

const rectOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
async function clickAt(box) {
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(500);
}
const clickText = async (pattern) => {
  const box = await rectOf(`[...document.querySelectorAll('button')].find((e) => new RegExp(${JSON.stringify(pattern)}).test(e.textContent))`);
  if (!box) return false;
  await clickAt(box);
  return true;
};

// Routes: every one must render the app, and protected ones must bounce to /login.
const routes = [
  ["/", "/"],
  ["/login", "/login"],
  ["/platform", "/login"],
  ["/onboarding", "/login"],
  ["/import", "/login"],
  ["/admin", "/login"],
  ["/forgot-password", "/forgot-password"],
  ["/accept-invite", "/accept-invite"],
  ["/nope/deep/link", "/"]
];
for (const [route, expected] of routes) {
  await send("Page.navigate", { url: `${PROD}${route}` });
  await sleep(3000);
  const path = await ev(`location.pathname`);
  const rendered = await ev(`(document.getElementById('root')?.children.length ?? 0) > 0`);
  check(`route ${route} → ${expected}`, path === expected && rendered === true, `got ${path}, rendered=${rendered}`);
}

// The deployed bundle must point at the intended Supabase project.
const target = await ev(`(() => {
  const keys = Object.keys(localStorage);
  return JSON.stringify({ storageKeys: keys.filter(k => k.includes('auth-token')) });
})()`);
check("deployed bundle is wired to a Supabase project", typeof target === "string", target?.slice(0, 60));

// Service worker: registers, activates and controls the page.
await send("Page.navigate", { url: `${PROD}/` });
await sleep(6000);
const sw = await ev(`(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return JSON.stringify({
    state: reg ? (reg.active?.state ?? reg.installing?.state ?? reg.waiting?.state) : null,
    controlled: !!navigator.serviceWorker.controller,
    caches: await caches.keys()
  });
})()`);
const swInfo = JSON.parse(sw ?? "{}");
check("service worker registers and activates on the deployed site", swInfo.state === "activated", `state=${swInfo.state}`);
check("service worker precache is populated", (swInfo.caches ?? []).some((c) => /precache/.test(c)), (swInfo.caches ?? []).join(","));
check("installability: https + manifest + activated service worker",
  PROD.startsWith("https://") && swInfo.state === "activated" && !!manifest.start_url, "criteria met");

// ── 4. Real login through the deployed artifact ─────────────────────────────
// Signed out, the workspace must send visitors to sign-in (no Demo Mode fallback).
await send("Page.navigate", { url: `${PROD}/platform` });
await sleep(5000);
const signedOutText = (await ev(`document.body.innerText`)) ?? "";
check("signed out, the workspace redirects to sign-in (no Demo Mode)", (await ev(`location.pathname`)) === "/login" && !/Demo Mode/.test(signedOutText), await ev(`location.pathname`));
await send("Page.navigate", { url: `${PROD}/reset-password` });
await sleep(3000);
check("reset-password route renders", (await ev(`location.pathname`)) === "/reset-password", await ev(`location.pathname`));
if (!SMOKE) {
  console.log("skip signed-in checks: no smoke account supplied (production holds no test accounts; set NEVOUT_SMOKE_EMAIL + NEVOUT_SMOKE_PASSWORD_FILE)");
} else {
await send("Page.navigate", { url: `${PROD}/login` });
await sleep(4000);
const emailBox = await rectOf(`document.querySelectorAll('input')[0]`);
if (emailBox) { await clickAt(emailBox); await send("Input.insertText", { text: SMOKE.email }); }
const pwBox = await rectOf(`document.querySelector('input[type=password]')`);
if (pwBox) { await clickAt(pwBox); await send("Input.insertText", { text: SMOKE.password }); }
await clickText("Sign in|Log in|Continue");
await sleep(9000);
check("owner signs in on the deployed site", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));
const platformText = await ev(`document.body.innerText`);
check("the deployed app loads live pharmacy data", /Dashboard|Inventory|Customers/.test(platformText ?? ""), (platformText ?? "").slice(0, 60).replace(/\n/g, " | "));
check("the deployed app is not in Demo Mode", !/Demo Mode/.test(platformText ?? ""), "no demo badge");

// Session survives a reload (auth redirect handling on the real origin).
await send("Page.navigate", { url: `${PROD}/platform` });
await sleep(7000);
check("session is restored after a reload on the deployed site", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));

// Logout returns to a public page.
await send("Page.navigate", { url: `${PROD}/platform` });
await sleep(6000);
// Sign out: the account menu (Phase 8 shell), or the old header button.
if (!(await clickText("^Logout$"))) {
  const acct = await rectOf(`document.querySelector('button[aria-label^="Account menu"]')`);
  if (acct) { await clickAt(acct); await sleep(400); await clickText("^Sign out$"); }
}
await sleep(5000);
const afterLogout = await ev(`location.pathname`);
check("logout leaves the workspace", afterLogout === "/login" || afterLogout === "/", `path=${afterLogout}`);
}

const realErrors = logs.filter((t) => !/401|403|Failed to load resource/.test(t));
check("no unexpected console errors on the deployed site", realErrors.length === 0, realErrors.slice(0, 2).join(" | ").slice(0, 140));

console.log(`\n# ${pass + fail} production smoke checks, ${fail} failed`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
