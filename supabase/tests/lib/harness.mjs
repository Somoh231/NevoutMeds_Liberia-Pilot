// Shared CDP harness for the Phase 8 browser suites (real Chromium, no extra
// test runner). Synthetic accounts only.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const BASE = process.env.APP_BASE || "http://127.0.0.1:4178";
export const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
export const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
export const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export const VIEWPORTS = {
  "360": { width: 360, height: 780, mobile: true, dpr: 2 },
  "390": { width: 390, height: 844, mobile: true, dpr: 2 },
  "430": { width: 430, height: 932, mobile: true, dpr: 2 },
  tablet: { width: 768, height: 1024, mobile: true, dpr: 1 },
  laptop: { width: 1366, height: 768, mobile: false, dpr: 1 },
  desktop: { width: 1920, height: 1080, mobile: false, dpr: 1 }
};

export function reporter() {
  let pass = 0, fail = 0;
  const check = (d, ok, detail) => { if (ok) { pass++; console.log(`ok   ${d}${detail ? ` [${detail}]` : ""}`); } else { fail++; console.log(`NOT OK ${d} [${detail}]`); } };
  const done = (label) => { console.log(`\n# ${pass + fail} ${label}, ${fail} failed`); return fail; };
  return { check, done };
}

// ── API ground truth ────────────────────────────────────────────────────────
export async function apiLogin(email, password = IDS.password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return (await r.json()).access_token;
}
export const api = (token) => ({
  rest: (p, init = {}) => fetch(`${API}/rest/v1/${p}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } }).then(async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } }),
  rpc: (fn, body) => fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
});

// ── Browser ─────────────────────────────────────────────────────────────────
export async function browser({ port, out }) {
  if (out) fs.mkdirSync(path.join(out, "shots"), { recursive: true });
  const proc = spawn(process.env.CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${process.env.UDD}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  // A test that crashes must not leave Chrome holding its debugging port: the next run would attach to the stale browser.
  process.once("exit", () => { try { proc.kill(); } catch { /* already gone */ } });
  let list; for (let i = 0; i < 80; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await sleep(250); } }
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

  const b = {
    send, ev, exceptions,
    close: () => { ws.close(); proc.kill(); },
    async viewport(name) {
      const v = VIEWPORTS[name];
      await send("Emulation.setDeviceMetricsOverride", { width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile, screenWidth: v.width, screenHeight: v.height });
      await send("Emulation.setTouchEmulationEnabled", { enabled: v.mobile, maxTouchPoints: v.mobile ? 5 : 0 });
      b.width = v.width;
    },
    go: async (url, wait = 2500) => { await send("Page.navigate", { url: url.startsWith("http") ? url : `${BASE}${url}` }); await sleep(wait); },
    shot: async (name) => { if (!out) return; const r = await send("Page.captureScreenshot", { format: "png" }); if (r.result?.data) fs.writeFileSync(path.join(out, "shots", `${name}.png`), Buffer.from(r.result.data, "base64")); },
    // Input events use visual-viewport coordinates; after typing in a field on
    // an emulated phone the visual viewport can be panned from the layout one.
    rectOf: (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); const vv = window.visualViewport; const ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0; return JSON.stringify({x:r.x+r.width/2-ox, y:r.y+r.height/2-oy}); })()`),
    async clickAt(box) { if (!box) return false; const { x, y } = JSON.parse(box); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await sleep(350); return true; },
    async click(selectorExpr) { return b.clickAt(await b.rectOf(selectorExpr)); },
    /** Click the first visible button/link whose text matches. */
    async clickText(pattern, scope = "document") {
      return b.click(`[...${scope}.querySelectorAll('button, a[href]')].find((e) => new RegExp(${JSON.stringify(pattern)}).test(e.textContent.trim()) && e.getBoundingClientRect().width > 0)`);
    },
    async press(key, times = 1) {
      const codes = { Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Backspace: 8 };
      for (let i = 0; i < times; i++) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: codes[key], ...(key === "Enter" ? { text: "\r" } : {}) });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: codes[key] });
        await sleep(100);
      }
    },
    type: (text) => send("Input.insertText", { text }),
    async fill(selectorExpr, text) { await b.click(selectorExpr); await ev(`document.activeElement?.select?.(); 1`); await b.type(text); },
    text: () => ev(`document.body.innerText`),
    mainText: () => ev(`document.querySelector('main')?.innerText ?? ''`),
    pan: () => ev(`Math.max(0, Math.max(window.innerWidth, document.documentElement.scrollWidth) - ${"screen.width"})`),
    /** Text cut off at the right edge that is NOT inside an intentional horizontal scroller. */
    clipped: () => ev(`(() => { const dw = Math.min(innerWidth, screen.width); const out = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (tw.nextNode()) { const t = tw.currentNode.textContent.trim(); const el = tw.currentNode.parentElement; if (!t || !el || !el.getClientRects().length) continue;
        const rg = document.createRange(); rg.selectNodeContents(tw.currentNode); const r = rg.getBoundingClientRect(); if (!(r.width > 0 && r.right > dw + 1 && r.left < dw)) continue;
        let sc = false; for (let n = el; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth) { sc = true; break; } }
        if (!sc) out.push(t.slice(0, 30)); } return out.slice(0, 6).join(' | '); })()`),
    async axe(include) {
      const runOnce = async () => {
        await ev(`window.axe ? 1 : (function(){ ${AXE}; return 1; })()`);
        return ev(`(async () => { try {
          const ctx = ${include ? JSON.stringify({ include: include.map((s) => [s]) }) : "document"};
          const r = await axe.run(ctx, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"] }, resultTypes: ["violations"] });
          return JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes[0]?.target?.join(' ') })));
        } catch (e) { return "ERR:" + (e?.message ?? String(e)); } })()`);
      };
      // axe.run can throw transiently (a re-render or late navigation mid-scan); retry once after settling.
      let res = await runOnce();
      if (typeof res !== "string" || res.startsWith("ERR:")) { await new Promise((r) => setTimeout(r, 800)); res = await runOnce(); }
      if (typeof res !== "string" || res.startsWith("ERR:")) throw new Error(`axe failed: ${typeof res === "string" ? res : JSON.stringify(res)}`);
      const v = JSON.parse(res);
      const serious = v.filter((x) => x.impact === "critical" || x.impact === "serious");
      return { serious, text: serious.map((x) => `${x.id}(${x.impact},${x.n}) ${x.t ?? ""}`).join("; ").slice(0, 240) || "none" };
    },
    async offline(on) {
      await send("Network.emulateNetworkConditions", on ? { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await ev(`window.dispatchEvent(new Event('${on ? "offline" : "online"}')); 1`);
    },
    async reset() {
      await b.offline(false);
      await b.go("/", 1200);
      await ev(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases?.()) ?? []) indexedDB.deleteDatabase(d.name); return 1; })()`);
    },
    async signIn(email, password = IDS.password) {
      await b.go("/login", 2500);
      await b.click(`document.querySelector('input[type=email]')`); await b.type(email);
      await b.click(`document.querySelector('input[type=password]')`); await b.type(password);
      await b.press("Enter");
      for (let i = 0; i < 40; i++) { await sleep(300); if ((await ev(`location.pathname`)) === "/platform") break; }
      await sleep(3500);
      return ev(`location.pathname`);
    },
    /** Open a workspace screen through the real navigation (More sheet on phones). */
    async open(id) {
      let ok = await ev(`(() => { const b = document.querySelector('[data-nav-id="${id}"]'); if (!b) return false; b.click(); return true; })()`);
      if (!ok && (await ev(`!!document.querySelector('[data-nav-more]')`))) {
        await ev(`document.querySelector('[data-nav-more]').click()`); await sleep(500);
        ok = await ev(`(() => { const b = document.querySelector('[data-nav-id="${id}"]'); if (!b) return false; b.click(); return true; })()`);
      }
      await sleep(2200);
      return ok;
    },
    waitFor: async (expr, ms = 10000) => { for (let i = 0; i < ms / 250; i++) { if (await ev(expr)) return true; await sleep(250); } return false; }
  };
  return b;
}
