// NevOut Meds — Phase 8 foundation gate.
//
// Proves, in a real browser, what the design foundation promises:
//   · no horizontal panning at 360/390/430/tablet/laptop/desktop
//   · axe-core: zero critical/serious WCAG 2.2 AA issues on auth pages and the app shell
//   · accessible brand contrast, visible focus, reduced motion
//   · keyboard-only sign-in, menu and dialog focus management
//   · phone navigation (bottom bar + More sheet) reaches every screen
//   · password reset reachable; a real invitation accepted through the UI
//   · offline, pending-sync, conflict and loading states are visible, not hidden
// Screenshots for the visual matrix are written to $OUT/shots.
//
// Usage: APP_BASE=http://127.0.0.1:4178 NEVOUT_API_URL=<supabase> CHROME=<path> UDD=<dir> OUT=<dir> \
//          node supabase/tests/ui_foundation.e2e.mjs
// Prerequisites: seed_remote.mjs / seed_e2e.sh (synthetic data only).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BASE = process.env.APP_BASE || "http://127.0.0.1:4178";
const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const OUT = process.env.OUT || "./foundation-out";
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const SERVICE = fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim();
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// SECTIONS=2,9 runs only those sections (sign-in happens in 4; later sections expect a session).
const ONLY = process.env.SECTIONS?.split(",").map(Number);
const RUN = (n) => !ONLY || ONLY.includes(n);

let pass = 0, fail = 0;
const check = (d, ok, detail) => { if (ok) { pass++; console.log(`ok   ${d}${detail ? ` [${detail}]` : ""}`); } else { fail++; console.log(`NOT OK ${d} [${detail}]`); } };

const VIEWPORTS = [
  { name: "360", width: 360, height: 780, mobile: true, dpr: 2 },
  { name: "390", width: 390, height: 844, mobile: true, dpr: 2 },
  { name: "430", width: 430, height: 932, mobile: true, dpr: 2 },
  { name: "tablet", width: 768, height: 1024, mobile: true, dpr: 1 },
  { name: "laptop", width: 1366, height: 768, mobile: false, dpr: 1 },
  { name: "desktop", width: 1920, height: 1080, mobile: false, dpr: 1 }
];
const vp = (n) => VIEWPORTS.find((v) => v.name === n);

// ── API helpers (ground truth + invitation setup) ───────────────────────────
async function login(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: IDS.password }) });
  return (await r.json()).access_token;
}
const staffAdmin = async (token, payload) => {
  const r = await fetch(`${API}/functions/v1/staff-admin`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const adminApi = (p, init = {}) => fetch(`${API}/auth/v1${p}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" } }).then((r) => r.json());

// ── CDP plumbing ────────────────────────────────────────────────────────────
const proc = spawn(process.env.CHROME, ["--remote-debugging-port=9390", `--user-data-dir=${process.env.UDD}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let list; for (let i = 0; i < 80; i++) { try { list = await (await fetch("http://127.0.0.1:9390/json/list")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const exceptions = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") exceptions.push(d.params.exceptionDetails?.exception?.description?.slice(0, 160) ?? "exception");
};
const send = (method, params = {}) => new Promise((resolve) => {
  const i = ++id; const t = setTimeout(() => { pend.delete(i); resolve({ timedOut: true }); }, 45_000);
  pend.set(i, (d) => { clearTimeout(t); resolve(d); }); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");

async function setViewport(v) {
  await send("Emulation.setDeviceMetricsOverride", { width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile, screenWidth: v.width, screenHeight: v.height });
  await send("Emulation.setTouchEmulationEnabled", { enabled: v.mobile, maxTouchPoints: v.mobile ? 5 : 0 });
}
const go = async (url, wait = 2500) => { await send("Page.navigate", { url: url.startsWith("http") ? url : `${BASE}${url}` }); await sleep(wait); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); if (r.result?.data) fs.writeFileSync(path.join(OUT, "shots", `${name}.png`), Buffer.from(r.result.data, "base64")); };
const rectOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
async function clickAt(box) { if (!box) return false; const { x, y } = JSON.parse(box); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await sleep(350); return true; }
const KEYS = { Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38 };
async function press(key, times = 1) {
  for (let i = 0; i < times; i++) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: KEYS[key], ...(key === "Enter" ? { text: "\r" } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: KEYS[key] });
    await sleep(120);
  }
}
const typeText = (text) => send("Input.insertText", { text });
const active = () => ev(`(() => { const a = document.activeElement; if (!a) return ''; return (a.tagName + '|' + (a.type||'') + '|' + (a.getAttribute('aria-label')||'') + '|' + (a.textContent||'').trim().slice(0,30)); })()`);
const panFor = (w) => ev(`Math.max(0, Math.max(window.innerWidth, document.documentElement.scrollWidth) - ${w})`);

async function axe(include) {
  await ev(`window.axe ? 1 : (function(){ ${AXE}; return 1; })()`);
  const res = await ev(`(async () => {
    const ctx = ${include ? JSON.stringify({ include: include.map((s) => [s]) }) : "document"};
    const r = await axe.run(ctx, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"] }, resultTypes: ["violations"] });
    return JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes[0]?.target?.join(' ') })));
  })()`);
  const v = JSON.parse(res ?? "[]");
  return { all: v, serious: v.filter((x) => x.impact === "critical" || x.impact === "serious") };
}
const fmtAxe = (v) => v.map((x) => `${x.id}(${x.impact},${x.n}) ${x.t ?? ""}`).join("; ").slice(0, 220) || "none";

async function resetBrowser() {
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await go("/", 1200);
  await ev(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases?.()) ?? []) indexedDB.deleteDatabase(d.name); return 1; })()`);
}
async function signInUi(email, pw = IDS.password) {
  await go("/login", 2500);
  await clickAt(await rectOf(`document.querySelector('input[type=email]')`)); await typeText(email);
  await clickAt(await rectOf(`document.querySelector('input[type=password]')`)); await typeText(pw);
  await press("Enter");
  for (let i = 0; i < 40; i++) { await sleep(300); if ((await ev(`location.pathname`)) === "/platform") break; }
  await sleep(3500);
  return ev(`location.pathname`);
}
async function openScreen(id) {
  let ok = await ev(`(() => { const b = document.querySelector('[data-nav-id="${id}"]'); if (!b) return false; b.click(); return true; })()`);
  if (!ok && (await ev(`!!document.querySelector('[data-nav-more]')`))) {
    await ev(`document.querySelector('[data-nav-more]').click()`); await sleep(500);
    ok = await ev(`(() => { const b = document.querySelector('[data-nav-id="${id}"]'); if (!b) return false; b.click(); return true; })()`);
  }
  await sleep(2200);
  return ok;
}
const SHELL = [".nv-topbar", ".nv-sidebar", ".nv-rail", ".nv-bottomnav", ".nv-banner", ".nv-skip-link"];

// ════════════════════════════════════════════════════════════════════════════
// 1. Tokens: brand contrast is fixed where it is actually rendered
// ════════════════════════════════════════════════════════════════════════════
if (RUN(1)) {
await resetBrowser();
await setViewport(vp("laptop"));
await go("/login");
const contrast = JSON.parse(await ev(`(() => {
  const lum = (c) => { const m = c.match(/\\d+(\\.\\d+)?/g).map(Number); const f = (v) => { v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const btn = document.querySelector('button[type=submit]'); const s = getComputedStyle(btn);
  const link = document.querySelector('a[href="/forgot-password"]'); const card = document.querySelector('.nv-auth__card');
  return JSON.stringify({ button: ratio(s.color, s.backgroundColor), link: ratio(getComputedStyle(link).color, getComputedStyle(card).backgroundColor), bg: s.backgroundColor });
})()`));
check("primary button: white on brand meets AA (was 2.54:1)", contrast.button >= 4.5, `${contrast.button.toFixed(2)}:1 on ${contrast.bg}`);
check("brand link text on the card meets AA", contrast.link >= 4.5, `${contrast.link.toFixed(2)}:1`);
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Auth pages: no panning, no serious WCAG issues, one h1, a main landmark
// ════════════════════════════════════════════════════════════════════════════
if (RUN(2)) {
const AUTH = [["login", "/login"], ["forgot", "/forgot-password"], ["reset-expired", "/reset-password"], ["invite", "/accept-invite?token=foundation-audit"], ["invite-missing", "/accept-invite"]];
let authPanFail = [], authAxeFail = [], authStructFail = [];
for (const v of VIEWPORTS) {
  await setViewport(v);
  for (const [name, route] of AUTH) {
    await go(route, name === "reset-expired" ? 3000 : 2200);
    const p = await panFor(v.width);
    if (p > 0) authPanFail.push(`${name}@${v.name}:${p}px`);
    const s = JSON.parse(await ev(`JSON.stringify({ h1: document.querySelectorAll('h1').length, main: !!document.querySelector('main') })`));
    if (s.h1 !== 1 || !s.main) authStructFail.push(`${name}@${v.name}:h1=${s.h1},main=${s.main}`);
    if (v.name === "360" || v.name === "laptop") {
      const a = await axe();
      if (a.serious.length) authAxeFail.push(`${name}@${v.name}: ${fmtAxe(a.serious)}`);
      await shot(`auth__${name}__${v.name}`);
    }
  }
}
check("auth pages never pan horizontally (5 pages × 6 viewports)", authPanFail.length === 0, authPanFail.join(", ") || "0 px everywhere");
check("auth pages: axe finds no critical/serious WCAG 2.2 AA issues (360 + laptop)", authAxeFail.length === 0, authAxeFail.join(" || ") || "none");
check("auth pages: exactly one h1 and a main landmark", authStructFail.length === 0, authStructFail.join(", ") || "all");
await setViewport(vp("laptop"));
await go("/reset-password", 3200);
check("an expired/invalid reset link says so and offers a new one", /expired/i.test(await ev(`document.body.innerText`)) && !!(await ev(`!!document.querySelector('a[href="/forgot-password"]')`)), "expired state");
await go("/accept-invite", 2000);
check("an invitation link without its code explains what to do", /missing its invitation code/i.test(await ev(`document.body.innerText`)), "invalid-link state");
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Password reset is reachable from sign-in; Enter submits
// ════════════════════════════════════════════════════════════════════════════
if (RUN(3)) {
await go("/login");
await clickAt(await rectOf(`document.querySelector('a[href="/forgot-password"]')`));
await sleep(1500);
check("'Forgot your password?' on sign-in opens the reset form", (await ev(`location.pathname`)) === "/forgot-password" && (await ev(`!!document.querySelector('input[type=email]')`)), await ev(`location.pathname`));
await clickAt(await rectOf(`document.querySelector('input[type=email]')`));
await typeText("not-an-email");
await press("Enter");
await sleep(500);
check("reset form validates in plain language on Enter", /Enter the email address/i.test(await ev(`document.body.innerText`)) && (await ev(`document.querySelector('input[type=email]').getAttribute('aria-invalid')`)) === "true", "inline error + aria-invalid");
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Keyboard-only sign-in with visible focus
// ════════════════════════════════════════════════════════════════════════════
if (RUN(4)) {
await resetBrowser();
await setViewport(vp("laptop"));
await go("/login", 2500);
await ev(`document.activeElement?.blur(); document.body.focus(); 1`);
let tabs = 0;
for (; tabs < 6; tabs++) { await press("Tab"); if ((await active()).startsWith("INPUT|email")) break; }
check("keyboard: email field is reached within a few Tab presses", (await active()).startsWith("INPUT|email"), `${tabs + 1} Tab(s)`);
const ring = JSON.parse(await ev(`(() => { const s = getComputedStyle(document.activeElement); return JSON.stringify({ o: s.outlineStyle, w: s.outlineWidth, b: s.boxShadow }); })()`));
check("keyboard: focused field shows a visible focus indicator", ring.o !== "none" || (ring.b && ring.b !== "none"), `${ring.o} ${ring.w}`);
await typeText("ownerA@e2e.local");
await press("Tab");
check("keyboard: Tab moves from email to password", (await active()).startsWith("INPUT|password"), await active());
await typeText(IDS.password);
await press("Enter");
for (let i = 0; i < 40; i++) { await sleep(300); if ((await ev(`location.pathname`)) === "/platform") break; }
check("keyboard: Enter signs in (no mouse used)", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));
await sleep(3500);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. Workspace shell at every viewport: no panning on any screen, shell a11y
// ════════════════════════════════════════════════════════════════════════════
if (RUN(5)) {
const SCREENS = ["dashboard", "inventory", "customers", "reminders", "suppliers", "financials", "analytics", "staff", "documents"];
let wsPan = [], wsUnreach = [], shellAxe = [], shellStruct = [];
for (const v of VIEWPORTS) {
  await setViewport(v);
  await go("/platform", 4500);
  const layout = await ev(`document.querySelector('.nv-shell')?.className.match(/nv-shell--(\\w+)/)?.[1]`);
  const expected = v.width >= 1200 ? "desktop" : v.width >= 768 ? "tablet" : "phone";
  if (layout !== expected) shellStruct.push(`${v.name}: layout ${layout}≠${expected}`);
  const s = JSON.parse(await ev(`JSON.stringify({ h1: document.querySelectorAll('h1').length, main: !!document.querySelector('main#main'), navs: document.querySelectorAll('nav[aria-label="Main"]').length })`));
  if (s.h1 !== 1 || !s.main || s.navs !== 1) shellStruct.push(`${v.name}: h1=${s.h1} main=${s.main} navs=${s.navs}`);
  const a = await axe(SHELL);
  if (a.serious.length) shellAxe.push(`${v.name}: ${fmtAxe(a.serious)}`);
  await shot(`shell__dashboard__${v.name}`);
  for (const sc of SCREENS) {
    if (!(await openScreen(sc))) { wsUnreach.push(`${sc}@${v.name}`); continue; }
    const p = await panFor(v.width);
    if (p > 0) wsPan.push(`${sc}@${v.name}:${p}px`);
  }
}
check("workspace: every screen reachable from the navigation at every viewport", wsUnreach.length === 0, wsUnreach.join(", ") || "9 screens × 6 viewports");
check("workspace: no screen pans horizontally at 360/390/430/tablet/laptop/desktop", wsPan.length === 0, wsPan.join(", ") || "0 px on 54 screen×viewport pairs");
check("shell: right layout per width, one h1, one main landmark, one main nav", shellStruct.length === 0, shellStruct.join("; ") || "phone<768≤tablet<1200≤desktop");
check("shell: axe finds no critical/serious WCAG issues in the app chrome", shellAxe.length === 0, shellAxe.join(" || ") || "none");
}

// ════════════════════════════════════════════════════════════════════════════
// 6. Phone navigation: bottom bar, More sheet, focus handling
// ════════════════════════════════════════════════════════════════════════════
if (RUN(6)) {
await setViewport(vp("360"));
await go("/platform", 4500);
const bar = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.nv-bottomnav button')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width) }; }))`));
check("phone: bottom bar has 5 destinations", bar.length === 5, bar.map((b) => b.t.replace(/,.*/, "")).join(" · "));
const cut = await ev(`[...document.querySelectorAll('.nv-bottomnav__label')].filter(l => l.scrollWidth > l.clientWidth + 1).map(l => l.textContent).join(', ')`);
check("phone: no bottom-bar label is truncated at 360 px", cut === "", cut || "all labels whole");
check("phone: every bottom-bar target is at least 44×44 px", bar.every((b) => b.h >= 44 && b.w >= 44), bar.map((b) => `${b.w}×${b.h}`).join(" "));
await clickAt(await rectOf(`document.querySelector('[data-nav-id="inventory"]')`));
await sleep(1500);
check("phone: tapping a tab switches screen and marks it current", (await ev(`document.querySelector('[data-nav-id="inventory"]').getAttribute('aria-current')`)) === "page" && /Inventory/.test(await ev(`document.querySelector('h1').textContent`)), "Inventory");
await clickAt(await rectOf(`document.querySelector('[data-nav-more]')`));
await sleep(700);
check("phone: More opens a modal sheet with focus inside it", await ev(`(() => { const d = document.querySelector('dialog[open]'); return !!d && d.contains(document.activeElement); })()`), await active());
await shot("shell__more-sheet__360");
await press("Escape");
await sleep(500);
check("phone: Esc closes the sheet and returns focus to More", (await ev(`!document.querySelector('dialog[open]')`)) && (await ev(`document.activeElement?.hasAttribute('data-nav-more')`)), await active());
await clickAt(await rectOf(`document.querySelector('[data-nav-more]')`));
await sleep(600);
await clickAt(await rectOf(`document.querySelector('dialog[open] [data-nav-id="staff"]')`));
await sleep(2000);
check("phone: screens under More open from the sheet", /Staff/.test(await ev(`document.querySelector('h1').textContent`)) && (await ev(`!document.querySelector('dialog[open]')`)), await ev(`document.querySelector('h1').textContent`));
}

// ════════════════════════════════════════════════════════════════════════════
// 7. Account menu and dialogs: keyboard and focus trap
// ════════════════════════════════════════════════════════════════════════════
if (RUN(7)) {
await setViewport(vp("laptop"));
await go("/platform", 4000);
await ev(`document.querySelector('button[aria-label^="Account menu"]').focus(); 1`);
await press("Enter");
await sleep(300);
check("account menu: Enter opens it and focuses the first item", (await ev(`document.activeElement?.getAttribute('role')`)) === "menuitem", await active());
await press("ArrowDown");
const second = await active();
await press("Escape");
await sleep(200);
check("account menu: arrows move, Esc closes and returns focus to the trigger", /Import|Sign out|Admin/.test(second) && (await ev(`document.activeElement?.getAttribute('aria-label')?.startsWith('Account menu')`)), second);
await ev(`document.querySelector('button[aria-label^="Account menu"]').click(); 1`);
await sleep(300);
await ev(`[...document.querySelectorAll('[role=menuitem]')].find(e => /Help/.test(e.textContent)).click(); 1`);
await sleep(600);
let trapped = true;
for (let i = 0; i < 14; i++) { await press("Tab"); if (!(await ev(`!!document.querySelector('dialog[open]')?.contains(document.activeElement)`))) { trapped = false; break; } }
check("dialog: Tab stays inside an open dialog (focus trap)", trapped, "14 Tab presses");
await shot("shell__help-dialog__laptop");
await press("Escape");
await sleep(400);
check("dialog: Esc closes it and focus returns to the page", (await ev(`!document.querySelector('dialog[open]')`)), await active());
}

// ════════════════════════════════════════════════════════════════════════════
// 8. Reduced motion
// ════════════════════════════════════════════════════════════════════════════
if (RUN(8)) {
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await sleep(300);
const dur = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--nv-dur-base').trim()`);
check("reduced motion: motion tokens collapse to ~0", /^0?\.01ms$/.test(dur), dur);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
}

// ════════════════════════════════════════════════════════════════════════════
// 9. States are visible: loading, offline, pending sync, conflict
// ════════════════════════════════════════════════════════════════════════════
if (RUN(9)) {
async function injectQueue(status, summary, extra = {}) {
  return ev(`(async () => {
    const open = indexedDB.open('nevoutmeds');
    const db = await new Promise((res) => { open.onsuccess = () => res(open.result); });
    const all = (s) => new Promise((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); });
    const tenant = (await all('queue'))[0]?.tenant_key ?? (await all('cache'))[0]?.tenant ?? (await all('cache'))[0]?.tenant_key;
    if (!tenant) return null;
    const [pharmacy, user] = tenant.split(':');
    const rec = { local_id: crypto.randomUUID(), idempotency_key: crypto.randomUUID(), tenant_key: tenant, pharmacy_id: pharmacy, user_id: user,
      device_id: 'foundation-test', mutation_type: 'create_customer', payload: {}, status: '${status}', retry_count: 0,
      created_at: new Date().toISOString(), last_attempt_at: null, synced_at: null, error_code: null,
      error_message: ${JSON.stringify(extra.error ?? null)}, conflict: null, summary: ${JSON.stringify(summary)} };
    await new Promise((res, rej) => { const r = db.transaction('queue', 'readwrite').objectStore('queue').put(rec); r.onsuccess = res; r.onerror = () => rej(r.error); });
    return rec.local_id;
  })()`);
}
const dropQueue = (localId) => ev(`(async () => { const open = indexedDB.open('nevoutmeds'); const db = await new Promise((res) => { open.onsuccess = () => res(open.result); }); await new Promise((res) => { const r = db.transaction('queue', 'readwrite').objectStore('queue').delete('${localId}'); r.onsuccess = res; r.onerror = res; }); return 1; })()`);

for (const vname of ["360", "laptop"]) {
  await setViewport(vp(vname));
  await go("/platform", 4500);
  await shot(`state__normal__${vname}`);
  // Offline: the banner and the pill both say so.
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await ev(`window.dispatchEvent(new Event('offline')); 1`);
  await sleep(1200);
  const offText = await ev(`document.body.innerText`);
  check(`offline (${vname}): banner and sync pill both show it`, /You’re offline/.test(offText) && /Offline/.test(await ev(`document.querySelector('.nv-sync-pill')?.textContent ?? ''`)), "banner + pill");
  await shot(`state__offline__${vname}`);
  // Pending: work saved on this device, app reopened while still offline.
  const pendingId = await injectQueue("pending", "Customer · foundation pending check");
  await go("/platform", 1000);
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  // Offline cold start restores the session from this device (Phase 6); allow for it.
  for (let i = 0; i < 40 && !(await ev(`!!document.querySelector('.nv-sync-pill')`)); i++) await sleep(500);
  await sleep(800);
  const penText = await ev(`document.body.innerText`);
  check(`pending (${vname}): reopened offline, unsynced work is counted, not called saved`, /saved on this device/.test(penText) && /·\s*1/.test(await ev(`document.querySelector('.nv-sync-pill')?.textContent ?? ''`)), (await ev(`document.querySelector('.nv-sync-pill')?.textContent`)) ?? "");
  await shot(`state__pending__${vname}`);
  await dropQueue(pendingId);
  // Conflict: back online with a change the server refused.
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const conflictId = await injectQueue("conflict", "Sale · foundation conflict check", { error: "Not enough stock to complete this sale." });
  await go("/platform", 5000);
  const conText = await ev(`document.body.innerText`);
  check(`conflict (${vname}): banner and pill say it needs attention; nothing silently dropped`, /need(s)? attention/i.test(conText) && /Needs attention/.test(await ev(`document.querySelector('.nv-sync-pill')?.textContent ?? ''`)), "banner + pill");
  await ev(`document.querySelector('.nv-sync-pill').click(); 1`);
  await sleep(500);
  check(`conflict (${vname}): details explain the rejection and that it is still saved`, /Not enough stock/.test(await ev(`document.body.innerText`)) && /still saved on this device/.test(await ev(`document.body.innerText`)), "ConflictState");
  await shot(`state__conflict__${vname}`);
  await dropQueue(conflictId);
  // Loading: cold first load on a slow link shows skeletons / "Loading…", never an empty "all good".
  await ev(`(async () => { for (const d of (await indexedDB.databases?.()) ?? []) if (d.name === 'nevoutmeds') indexedDB.deleteDatabase(d.name); return 1; })()`);
  await send("Network.emulateNetworkConditions", { offline: false, latency: 1200, downloadThroughput: 60_000, uploadThroughput: 60_000 });
  await send("Page.navigate", { url: `${BASE}/platform` });
  let sawLoading = false;
  for (let i = 0; i < 60; i++) { await sleep(250); const t = (await ev(`document.body?.innerText ?? ''`)) ?? ""; if (/Loading (stock|customers|sales|your workspace)|Loading…/.test(t) && (await ev(`!!document.querySelector('.nv-shell, [role=status]')`))) { sawLoading = true; await shot(`state__loading__${vname}`); break; } }
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check(`loading (${vname}): a slow first load shows a loading state`, sawLoading, `sawLoading=${sawLoading}`);
  await sleep(6000);
}
}

// ════════════════════════════════════════════════════════════════════════════
// 10. Real invitation accepted through the redesigned UI
// ════════════════════════════════════════════════════════════════════════════
if (RUN(10)) {
const ownerToken = await login("ownerA@e2e.local");
const inviteEmail = `foundation${Date.now()}@e2e.local`;
const inv = await staffAdmin(ownerToken, { action: "invite", email: inviteEmail, name: "Foundation Invitee", role: "staff" });
const inviteToken = inv.body?.accept_url ? new URL(inv.body.accept_url).searchParams.get("token") : null;
check("owner can create an invitation (Edge Function)", !!inviteToken, `${inv.status}`);
// No SMTP on the pilot project: provision the invitee's identity directly (synthetic address).
const created = await adminApi("/admin/users", { method: "POST", body: JSON.stringify({ email: inviteEmail, password: IDS.password, email_confirm: true }) });
let inviteeId = created?.id ?? created?.user?.id;
if (!inviteeId) { const lst = await adminApi(`/admin/users?per_page=200`); inviteeId = (lst.users ?? []).find((u) => u.email === inviteEmail)?.id; }
// The local stack's invite already creates the identity (unconfirmed, no
// password); give it the test password so the invitee can sign in.
if (inviteeId && !(created?.id ?? created?.user?.id)) await adminApi(`/admin/users/${inviteeId}`, { method: "PUT", body: JSON.stringify({ password: IDS.password, email_confirm: true }) });
await resetBrowser();
await setViewport(vp("390"));
await go(`/accept-invite?token=${encodeURIComponent(inviteToken ?? "")}`, 2500);
check("invite page: sign-in / create-account choice is shown", /I have an account/.test(await ev(`document.body.innerText`)) && /Create my account/.test(await ev(`document.body.innerText`)), "tabs");
await shot("auth__invite-live__390");
await clickAt(await rectOf(`document.querySelector('input[type=email]')`)); await typeText(inviteEmail);
await clickAt(await rectOf(`document.querySelector('input[type=password]')`)); await typeText(IDS.password);
await press("Enter");
for (let i = 0; i < 50; i++) { await sleep(400); if ((await ev(`location.pathname`)) === "/platform") break; }
if ((await ev(`location.pathname`)) !== "/platform") { await shot("auth__invite-stuck__390"); console.log("# invite page said:", ((await ev(`document.querySelector('.nv-auth__card')?.innerText`)) ?? "").replace(/\n/g, " | ").slice(0, 300)); }
await sleep(4500);
const staffView = (await ev(`document.body.innerText`)) ?? "";
check("invite accepted through the UI lands in the workspace", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));
check("invited staff member sees their pharmacy and no owner-only navigation", /E2E Pharmacy A/.test(staffView) && !(await ev(`!!document.querySelector('[data-nav-id="staff"], [data-nav-id="financials"]')`)), "staff nav");
if (inviteeId) await staffAdmin(ownerToken, { action: "remove", user_id: inviteeId });
}

// ════════════════════════════════════════════════════════════════════════════
// 11. Sign out through the account menu; no uncaught errors throughout
// ════════════════════════════════════════════════════════════════════════════
if (RUN(11)) {
await ev(`document.querySelector('button[aria-label^="Account menu"]').click(); 1`);
await sleep(300);
await ev(`[...document.querySelectorAll('[role=menuitem]')].find(e => /Sign out/.test(e.textContent)).click(); 1`);
await sleep(3000);
check("sign out from the account menu leaves the workspace", ["/login", "/"].includes(await ev(`location.pathname`)), await ev(`location.pathname`));
const realExceptions = exceptions.filter((e) => !/Failed to fetch|NetworkError|Load failed/i.test(e));
check("no uncaught exceptions during the whole run", realExceptions.length === 0, realExceptions.slice(0, 2).join(" | "));

console.log(`\n# ${pass + fail} foundation checks, ${fail} failed`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
}

