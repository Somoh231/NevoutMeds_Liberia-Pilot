// NevOut Meds — Phase 8 UX audit harness.
//
// Visits every route and every in-app screen at six viewports and MEASURES
// usability defects instead of eyeballing them: horizontal overflow, content
// width left after chrome, touch-target size, tiny text, colour contrast,
// unlabeled controls, heading structure, and slow-network first paint.
// Screenshots are written for human review; findings go to a JSON report.
//
// Synthetic accounts only (supabase/tests/seed_remote.mjs or seed_e2e.sh).
//
// Usage:
//   APP_URL=https://<app> CHROME=<path> UDD=<profile dir> OUT=<dir> \
//     node supabase/tests/ux_audit.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = (process.env.APP_URL || "https://nevout-meds-liberia-pilot.vercel.app").replace(/\/$/, "");
const OUT = process.env.OUT || "./ux-audit-out";
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const ONLY = process.env.ONLY_VIEWPORTS?.split(",");
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { name: "360", width: 360, height: 780, mobile: true, dpr: 2 },
  { name: "390", width: 390, height: 844, mobile: true, dpr: 3 },
  { name: "430", width: 430, height: 932, mobile: true, dpr: 3 },
  { name: "tablet", width: 768, height: 1024, mobile: true, dpr: 2 },
  { name: "1024", width: 1024, height: 1366, mobile: true, dpr: 2 },
  { name: "laptop", width: 1366, height: 768, mobile: false, dpr: 1 },
  { name: "desktop", width: 1920, height: 1080, mobile: false, dpr: 1 }
].filter((v) => !ONLY || ONLY.includes(v.name));

// ── CDP plumbing ─────────────────────────────────────────────────────────────
const proc = spawn(process.env.CHROME, ["--remote-debugging-port=9370", `--user-data-dir=${process.env.UDD}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let list;
for (let i = 0; i < 80; i++) { try { list = await (await fetch("http://127.0.0.1:9370/json/list")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const consoleErrors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  else if (d.method === "Log.entryAdded" && d.params.entry.level === "error") consoleErrors.push(d.params.entry.text);
};
const send = (method, params = {}) => new Promise((resolve) => {
  const i = ++id;
  const t = setTimeout(() => { pend.delete(i); resolve({ timedOut: true }); }, 45_000);
  pend.set(i, (d) => { clearTimeout(t); resolve(d); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable"); await send("Network.enable");

async function setViewport(vp) {
  await send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile, screenWidth: vp.width, screenHeight: vp.height });
  await send("Emulation.setTouchEmulationEnabled", { enabled: vp.mobile, maxTouchPoints: vp.mobile ? 5 : 0 });
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (r.result?.data) fs.writeFileSync(path.join(OUT, "shots", `${name}.png`), Buffer.from(r.result.data, "base64"));
}
async function fullShot(name) {
  const h = await ev(`Math.min(document.documentElement.scrollHeight, 6000)`);
  const w = await ev(`window.innerWidth`);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  if (r.result?.data) fs.writeFileSync(path.join(OUT, "shots", `${name}.full.png`), Buffer.from(r.result.data, "base64"));
}

// ── The measurement, evaluated inside the page ──────────────────────────────
const MEASURE = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  // On phones an over-wide page stretches the layout viewport, so compare with
  // the physical screen width instead or the culprit hides itself.
  const dw = Math.min(vw, screen.width || vw);
  const visible = (el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05;
  };
  const describe = (el) => {
    const t = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.getAttribute("title") || "").trim().replace(/\\s+/g, " ").slice(0, 40);
    return el.tagName.toLowerCase() + (t ? ' "' + t + '"' : "");
  };
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  // Effective background: walk up, compositing translucent layers. Gradients or
  // images make the result unknowable from CSS alone, so those are skipped.
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) acc = blend(layers[i], acc);
    return acc;
  };

  const out = { vw, vh, scrollW: document.documentElement.scrollWidth, overflowX: [], smallTargets24: [], smallTargets44: 0, targets: 0,
                tinyText: [], contrast: [], unlabeled: [], headings: [], sidebarW: 0, mainW: 0, title: document.title,
                lang: document.documentElement.lang, viewportMeta: document.querySelector('meta[name=viewport]')?.content || null,
                emojiIcons: 0, textNodes: 0 };

  // Overflow: elements poking past the right edge of the viewport.
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > dw + 1 && r.width < vw * 3) {
      // Report the outermost offender only.
      const p = el.parentElement; const pr = p?.getBoundingClientRect();
      if (!pr || pr.right <= dw + 1) out.overflowX.push(describe(el) + " → " + Math.round(r.right) + "px");
    }
  }
  out.overflowX = [...new Set(out.overflowX)].slice(0, 15);
  // Clipped: text the user cannot see because it runs past the right edge while
  // an ancestor hides the overflow (the page itself never scrolls sideways).
  out.clippedText = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const t = tw.currentNode.textContent.trim(); const el = tw.currentNode.parentElement;
    if (!t || !el || !visible(el)) continue;
    const range = document.createRange(); range.selectNodeContents(tw.currentNode);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.right > dw + 1 && r.left < dw) {
      // Text inside a horizontal scroller (a wide table, a chip strip) is reachable by
      // scrolling that region; count it separately from genuinely cut-off text.
      let sc = false;
      for (let n = el; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth) { sc = true; break; } }
      if (sc) out.inScroller = (out.inScroller || 0) + 1; else out.clippedText.push(JSON.stringify(t.slice(0, 30)) + " @" + Math.round(r.right));
    }
  }
  out.clippedCount = out.clippedText.length; out.clippedText = [...new Set(out.clippedText)].slice(0, 12);

  // Layout: how much width the sidebar leaves for the actual work.
  const aside = [...document.querySelectorAll("aside")].filter(visible).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  if (aside) out.sidebarW = Math.round(aside.getBoundingClientRect().width);
  out.mainW = vw - out.sidebarW;

  // Touch targets.
  const interactive = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [onclick]")].filter(visible);
  out.targets = interactive.length;
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (el.type === "checkbox" || el.type === "radio") { if (r.width < 24 || r.height < 24) { const l = el.closest("label"); if (!l || l.getBoundingClientRect().height < 24) out.smallTargets24.push(describe(el) + " " + Math.round(r.width) + "x" + Math.round(r.height)); } continue; }
    if (r.width < 24 || r.height < 24) out.smallTargets24.push(describe(el) + " " + Math.round(r.width) + "x" + Math.round(r.height));
    if (r.width < 44 || r.height < 44) out.smallTargets44++;
  }
  out.smallTargets24 = out.smallTargets24.slice(0, 25);

  // Accessible names.
  for (const el of interactive) {
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") {
      const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.closest("label") || (el.id && document.querySelector('label[for="' + el.id + '"]'));
      if (!labelled) out.unlabeled.push(describe(el) + (el.placeholder ? " (placeholder only)" : ""));
    } else {
      const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
      const imgAlt = el.querySelector("img[alt]")?.getAttribute("alt");
      if (!name && !imgAlt) out.unlabeled.push(describe(el) + " (no name)");
      else if (/^[\\p{Extended_Pictographic}\\u2B21\\u23FB\\u00D7\\u2715\\u2190-\\u21FF\\s]+$/u.test(name) && !el.getAttribute("aria-label")) out.unlabeled.push(tag + ' "' + name + '" (symbol only)');
    }
  }
  out.unlabeled = [...new Set(out.unlabeled)].slice(0, 20);

  // Text size and contrast, per text-bearing element.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode; const txt = node.textContent.trim();
    if (!txt) continue;
    const el = node.parentElement; if (!el || seen.has(el) || !visible(el)) continue;
    seen.add(el); out.textNodes++;
    if (/\\p{Extended_Pictographic}/u.test(txt) && txt.length <= 3) out.emojiIcons++;
    const s = getComputedStyle(el); const size = parseFloat(s.fontSize); const weight = parseInt(s.fontWeight, 10) || 400;
    if (size < 12 && /[A-Za-z0-9]/.test(txt)) out.tinyText.push(Math.round(size * 10) / 10 + "px " + JSON.stringify(txt.slice(0, 30)));
    const fg = parse(s.color); const bg = bgOf(el);
    if (!fg || !bg) continue;
    const fgc = fg.a < 1 ? blend(fg, bg) : fg;
    const L1 = lum(fgc), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    if (ratio < (large ? 3 : 4.5) && /[A-Za-z0-9]/.test(txt)) out.contrast.push(ratio.toFixed(2) + ":1 " + Math.round(size) + "px " + JSON.stringify(txt.slice(0, 28)));
  }
  out.tinyTextCount = out.tinyText.length; out.tinyText = [...new Set(out.tinyText)].slice(0, 15);
  out.contrastCount = out.contrast.length; out.contrast = [...new Set(out.contrast)].slice(0, 15);

  for (const h of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) if (visible(h)) out.headings.push(h.tagName + " " + h.textContent.trim().slice(0, 30));
  out.pageHeight = document.documentElement.scrollHeight;
  return JSON.stringify(out);
})()`;

const report = { app: APP, date: new Date().toISOString(), pages: [] };
async function audit(label, vp, extra = {}) {
  const m = JSON.parse((await ev(MEASURE)) ?? "{}");
  const name = `${vp.name}__${label}`;
  await shot(name);
  if (vp.name === "360" || vp.name === "laptop") await fullShot(name);
  // On phones an over-wide page silently widens the LAYOUT viewport, so
  // scrollWidth === innerWidth and nothing "overflows" — yet the user must pan.
  m.panPx = Math.max(0, m.vw - vp.width);
  report.pages.push({ page: label, viewport: vp.name, deviceWidth: vp.width, ...m, ...extra });
  const flag = (n, s) => (n ? `${s}=${n}` : "");
  console.log(`${name.padEnd(28)} pan=${m.panPx}px overflow=${m.scrollW > m.vw ? m.scrollW - m.vw + "px" : "0"} ${flag(m.clippedCount, "clipped")} main=${m.mainW}px ${flag(m.smallTargets24?.length, "tgt<24")} ${flag(m.tinyTextCount, "tiny")} ${flag(m.contrastCount, "lowContrast")} ${flag(m.unlabeled?.length, "unlabeled")}`);
}

// ── Sign in / out helpers ────────────────────────────────────────────────────
const rectOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
async function clickAt(box) {
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(400);
}
async function signOutHard() {
  await send("Page.navigate", { url: `${APP}/` }); await sleep(1500);
  await ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); indexedDB.databases?.().then(ds => ds.forEach(d => indexedDB.deleteDatabase(d.name))); } catch {} return 1; })()`);
}
async function signIn(email) {
  await signOutHard();
  await send("Page.navigate", { url: `${APP}/login` }); await sleep(3500);
  const e = await rectOf(`document.querySelector('input[type=email]') || document.querySelectorAll('input')[0]`);
  await clickAt(e); await send("Input.insertText", { text: email });
  const p = await rectOf(`document.querySelector('input[type=password]')`);
  await clickAt(p); await send("Input.insertText", { text: IDS.password });
  // Enter-to-submit is itself audited: record whether it works, then fall back to the button.
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(4000);
  report.enterSubmitsLogin = (await ev(`location.pathname`)) === "/platform";
  if (!report.enterSubmitsLogin) {
    const b = await rectOf(`[...document.querySelectorAll('button')].find((e) => /^(Sign in|Log in|Continue)/.test(e.textContent.trim()))`);
    if (b) await clickAt(b);
  }
  for (let i = 0; i < 30; i++) { await sleep(500); if ((await ev(`location.pathname`)) === "/platform") break; }
  await sleep(4000);
  return ev(`location.pathname`);
}
// In-app screens are component state, not routes: select them via the nav.
async function openScreen(label) {
  // Phase 8 shell: stable data-nav-id hooks; on phones, secondary screens sit in the More sheet.
  const id = label.toLowerCase();
  let ok = await ev(`(() => { const b = document.querySelector('[data-nav-id="${id}"]'); if (!b) return false; b.click(); return true; })()`);
  if (!ok && (await ev(`!!document.querySelector('[data-nav-more]')`))) {
    await ev(`document.querySelector('[data-nav-more]').click()`); await sleep(600);
    ok = await ev(`(() => { const b = document.querySelector('[data-nav-id="${id}"]'); if (!b) return false; b.click(); return true; })()`);
  }
  if (!ok) ok = await ev(`(() => { const b = [...document.querySelectorAll('aside button, nav button, [role=tab]')].find(e => e.textContent.replace(/[^A-Za-z ]/g, '').trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  await sleep(2500);
  return ok;
}

// ── 1. Public pages ──────────────────────────────────────────────────────────
const PUBLIC = [["home", "/"], ["login", "/login"], ["forgot-password", "/forgot-password"], ["accept-invite", "/accept-invite?token=synthetic-audit-token"], ["reset-password", "/reset-password"]];
await signOutHard();
for (const vp of VIEWPORTS) {
  await setViewport(vp);
  for (const [label, route] of PUBLIC) {
    await send("Page.navigate", { url: `${APP}${route}` }); await sleep(2500);
    await audit(label, vp);
  }
}

// ── 2. Owner workspace ───────────────────────────────────────────────────────
const OWNER_SCREENS = ["Dashboard", "Sales", "Inventory", "Expiry", "Customers", "Reminders", "Suppliers", "Financials", "Analytics", "Reports", "Staff", "Documents", "Settings"];
await setViewport(VIEWPORTS.find((v) => v.name === "laptop") ?? VIEWPORTS[0]);
const landed = await signIn("ownerA@e2e.local");
console.log(`# owner signed in → ${landed}`);
for (const vp of VIEWPORTS) {
  await setViewport(vp);
  await send("Page.navigate", { url: `${APP}/platform` }); await sleep(5000);
  for (const s of OWNER_SCREENS) {
    const found = await openScreen(s);
    if (!found) { report.pages.push({ page: `owner-${s}`, viewport: vp.name, unreachable: true }); console.log(`${vp.name}__owner-${s}  UNREACHABLE (no nav control visible)`); continue; }
    await ev(`window.scrollTo(0,0)`);
    await audit(`owner-${s.toLowerCase()}`, vp);
  }
  for (const [label, route] of [["import", "/import"], ["admin", "/admin"], ["onboarding", "/onboarding"]]) {
    await send("Page.navigate", { url: `${APP}${route}` }); await sleep(4000);
    await audit(`owner-${label}`, vp, { landedOn: await ev(`location.pathname`) });
  }
}

// ── 3. Primary dialogs on the smallest phone ─────────────────────────────────
const small = VIEWPORTS.find((v) => v.name === "360");
if (small) {
  await setViewport(small);
  for (const [screen, pattern] of [["Inventory", "Add|New"], ["Customers", "Add|New"], ["Inventory", "Adjust|Stock"], ["Reminders", "Add|New|Schedule"]]) {
    await send("Page.navigate", { url: `${APP}/platform` }); await sleep(5000);
    await openScreen(screen);
    const clicked = await ev(`(() => { const b = [...document.querySelectorAll('main button, button')].find(e => new RegExp(${JSON.stringify(pattern)}).test(e.textContent) && e.getBoundingClientRect().width > 0 && !e.closest('aside')); if (!b) return null; b.click(); return b.textContent.trim().slice(0,30); })()`);
    await sleep(1500);
    await audit(`dialog-${screen.toLowerCase()}-${(clicked || "none").replace(/[^a-z]+/gi, "-").toLowerCase()}`, small, { opened: clicked });
  }
}

// ── 3b. Detail surfaces (product detail, invite, document upload / view) ────
for (const vp of VIEWPORTS.filter((v) => ["360", "1024"].includes(v.name))) {
  await setViewport(vp);
  for (const [screen, label, open] of [
    ["Inventory", "product-detail", `document.querySelector('.nv-row__main')?.click()`],
    ["Staff", "invite", `[...document.querySelectorAll('main button')].find(b => /Invite team member/.test(b.textContent))?.click()`],
    ["Documents", "upload", `[...document.querySelectorAll('main button')].find(b => /Upload document/.test(b.textContent))?.click()`],
    ["Documents", "view", `document.querySelector('main button[aria-label^="View details"]')?.click()`]
  ]) {
    await send("Page.navigate", { url: `${APP}/platform` }); await sleep(5000);
    await openScreen(screen);
    await ev(`(() => { ${open}; return 1; })()`);
    await sleep(1500);
    await audit(`surface-${label}`, vp, { opened: await ev(`!!document.querySelector('dialog[open]')`) });
  }
}

// ── 4. Staff (non-owner) navigation on a phone ───────────────────────────────
if (small) {
  await setViewport(VIEWPORTS.find((v) => v.name === "laptop") ?? small);
  await signIn("staffA@e2e.local");
  await setViewport(small);
  await send("Page.navigate", { url: `${APP}/platform` }); await sleep(5000);
  await audit("staff-dashboard", small, { nav: await ev(`[...document.querySelectorAll('aside button')].map(b => b.textContent.trim()).join(' | ')`) });
}

// ── 5. First paint on a slow 3G phone (cold cache) ──────────────────────────
if (small) {
  await signOutHard();
  await send("Network.clearBrowserCache");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
  await send("Emulation.setCPUThrottlingRate", { rate: 4 });
  // Unregister the service worker so this is a genuine first visit.
  await ev(`navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => caches.keys()).then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => 1)`);
  const t0 = Date.now();
  await send("Page.navigate", { url: `${APP}/login` });
  let firstForm = null;
  for (let i = 0; i < 120; i++) { await sleep(250); if (await ev(`!!document.querySelector('input[type=password]')`)) { firstForm = Date.now() - t0; break; } }
  await sleep(3000);
  const perf = await ev(`JSON.stringify({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    transfer: performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0),
    requests: performance.getEntriesByType('resource').length,
    thirdParty: [...new Set(performance.getEntriesByType('resource').map(r => new URL(r.name).host).filter(h => h !== location.host))]
  })`);
  report.slow3g = { loginUsableMs: firstForm, ...JSON.parse(perf ?? "{}") };
  console.log(`# slow 3G + 4x CPU: login form usable after ${firstForm}ms`, report.slow3g);
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send("Emulation.setCPUThrottlingRate", { rate: 1 });
}

report.consoleErrors = [...new Set(consoleErrors)].slice(0, 20);
fs.writeFileSync(path.join(OUT, "ux_audit.json"), JSON.stringify(report, null, 2));
console.log(`\n# audited ${report.pages.length} page×viewport combinations → ${OUT}/ux_audit.json`);
ws.close(); proc.kill();
