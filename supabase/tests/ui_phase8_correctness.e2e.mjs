// NevOut Meds — Phase 8 correctness regressions found by the UX audit
// (docs/ux/UX_AUDIT.md, P0-2/3/4/6/7/8 and P1-1). Each check pins a defect that
// showed users wrong or invented information, or blocked a basic auth task.
//
// Usage: APP_BASE=http://127.0.0.1:4178 NEVOUT_API_URL=<supabase> CHROME=<path> UDD=<dir> \
//          node supabase/tests/ui_phase8_correctness.e2e.mjs
// Prerequisites: seed_remote.mjs (or seed_e2e.sh) — synthetic data only.
import { spawn } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.APP_BASE || "http://127.0.0.1:4178";
const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (d, ok, detail) => { if (ok) { pass++; console.log(`ok   ${d}${detail ? ` [${detail}]` : ""}`); } else { fail++; console.log(`NOT OK ${d} [${detail}]`); } };

// Ground truth straight from the API, as the owner.
const tok = (await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "ownerA@e2e.local", password: IDS.password })
})).json()).access_token;
const rest = (path, init = {}) => fetch(`${API}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(init.headers || {}) } }).then((r) => r.json());
const [pharmacy] = await rest(`pharmacies?select=name&id=eq.${IDS.pharmacyA}`);
const summary = await rest("rpc/financial_summary", { method: "POST", body: JSON.stringify({ p_days: 30 }) });
const expectedMargin = summary.revenue.total > 0 ? (((summary.revenue.total - summary.cogs.total) / summary.revenue.total) * 100).toFixed(1) + "%" : "—";
console.log(`# truth: pharmacy="${pharmacy.name}" revenue30=${summary.revenue.total} margin=${expectedMargin}`);

const proc = spawn(process.env.CHROME, ["--remote-debugging-port=9380", `--user-data-dir=${process.env.UDD}`, "about:blank"], { stdio: "ignore" });
let list; for (let i = 0; i < 80; i++) { try { list = await (await fetch("http://127.0.0.1:9380/json/list")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
const rectOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
async function clickAt(box) { const { x, y } = JSON.parse(box); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await sleep(300); }
const text = () => ev(`document.body.innerText`);
const openScreen = async (label) => { await ev(`[...document.querySelectorAll('aside button')].find(b => b.textContent.replace(/[^A-Za-z ]/g,'').trim() === ${JSON.stringify(label)})?.click()`); await sleep(2500); };
async function resetBrowser() {
  await send("Page.navigate", { url: `${BASE}/` }); await sleep(1200);
  await ev(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases?.()) ?? []) indexedDB.deleteDatabase(d.name); return 1; })()`);
}
async function typeLogin(email) {
  await send("Page.navigate", { url: `${BASE}/login` }); await sleep(2500);
  await clickAt(await rectOf(`document.querySelector('input[type=email]')`)); await send("Input.insertText", { text: email });
  await clickAt(await rectOf(`document.querySelector('input[type=password]')`)); await send("Input.insertText", { text: IDS.password });
}
const pressEnter = async () => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
};

// ── Auth UX (P0-6, P0-7, P2-1) ───────────────────────────────────────────────
await resetBrowser();
await send("Page.navigate", { url: `${BASE}/login` }); await sleep(2500);
const loginText = await text();
check("login links to password reset", (await ev(`!!document.querySelector('a[href="/forgot-password"]')`)) === true, "link present");
check("login shows no developer copy", !/RLS|Supabase|next step/.test(loginText), "no RLS/Supabase wording");
check("sign-up does not pre-fill a pharmacy name", await ev(`(() => { [...document.querySelectorAll('button')].find(b => /Owner Signup|Create an account/.test(b.textContent))?.click(); return new Promise(r => setTimeout(() => r([...document.querySelectorAll('input')].every(i => !/Monrovia/.test(i.value))), 300)); })()`), "all inputs empty");

// P1-1: first load on a slow link must say "loading", never "all healthy".
await resetBrowser();
await typeLogin("ownerA@e2e.local");
await send("Network.emulateNetworkConditions", { offline: false, latency: 1500, downloadThroughput: 50_000, uploadThroughput: 50_000 });
await pressEnter();
let sawLoading = false, sawFalseHealthy = false;
for (let i = 0; i < 80; i++) {
  await sleep(250);
  if ((await ev(`location.pathname`)) !== "/platform") continue;
  const t = (await text()) ?? "";
  if (/Loading stock/.test(t)) sawLoading = true;
  if (/All stock levels healthy/.test(t) && !sawLoading) sawFalseHealthy = true;
  if (sawLoading) break;
}
await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
check("Enter submits the login form", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));
check("slow first load says 'Loading stock…'", sawLoading, `sawLoading=${sawLoading}`);
check("dashboard never claims 'all stock healthy' before stock has loaded", (await ev(`location.pathname`)) === "/platform" && !sawFalseHealthy, `falseHealthy=${sawFalseHealthy}`);
await sleep(6000);

// ── Pharmacy identity (P0-4, P0-8) ───────────────────────────────────────────
const dash = (await text()) ?? "";
check("daily summary names this pharmacy (from the pharmacies row)", dash.includes(`Daily Report — ${pharmacy.name}`), dash.match(/Daily Report — [^*\n]*/)?.[0]);
check("no other pharmacy's name appears", /Daily Report/.test(dash) && !/Monrovia Central/.test(dash), /Daily Report/.test(dash) ? "no 'Monrovia Central'" : "dashboard not rendered");

// ── One revenue truth (P0-2, P0-3) ───────────────────────────────────────────
const dash30 = await ev(`(() => { const el = [...document.querySelectorAll('div')].find(d => d.children.length === 0 && /^Revenue \\(30 days\\)$/i.test(d.textContent.trim())); return el?.nextElementSibling?.textContent.trim() ?? null; })()`);
await openScreen("Analytics");
const an = (await text()) ?? "";
const an30 = an.match(/Revenue \(30d\)\s*\n\s*(\$[\d,.k]+)/i)?.[1];
const fmtK = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Number(n).toFixed(0)}`);
check("Dashboard 30-day revenue matches the server summary", dash30 === fmtK(summary.revenue.total), `${dash30} vs ${fmtK(summary.revenue.total)}`);
check("Analytics 30-day revenue matches the server summary", an30 === `$${Number(summary.revenue.total).toFixed(0)}`, `${an30} vs $${Number(summary.revenue.total).toFixed(0)}`);
check("Analytics shows no invented benchmark", /Revenue \(30d\)/i.test(an) && !/regional avg|55\.6%/i.test(an), /Revenue \(30d\)/i.test(an) ? "no 'regional avg'" : "analytics not rendered");
check("Analytics margin equals the server-computed gross margin", an.includes(expectedMargin), `expected ${expectedMargin}`);

// ── Dates (P1-13) ────────────────────────────────────────────────────────────
await openScreen("Inventory");
const inv = (await text()) ?? "";
check("expiry dates show a four-digit year", /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/.test(inv) && !/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2}\b/.test(inv), inv.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2,4}\b/)?.[0]);

// ── Invited staff see their own pharmacy, not a default ─────────────────────
await resetBrowser();
await typeLogin("staffA@e2e.local");
await pressEnter();
for (let i = 0; i < 40; i++) { await sleep(300); if ((await ev(`location.pathname`)) === "/platform") break; }
await sleep(6000);
const staffDash = (await text()) ?? "";
check("staff daily summary names their pharmacy", staffDash.includes(`Daily Report — ${pharmacy.name}`), staffDash.match(/Daily Report — [^*\n]*/)?.[0]);

console.log(`\n# ${pass + fail} Phase 8 correctness checks, ${fail} failed`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
