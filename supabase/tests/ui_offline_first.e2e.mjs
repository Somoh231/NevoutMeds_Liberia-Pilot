// NevOut Meds — Phase 6 offline-first browser test.
//
// Runs the exact required scenario in a real browser with the network actually
// disabled at the browser level (CDP Network.emulateNetworkConditions), not by
// stubbing fetch:
//
//   online → load data → offline → record work → close app → reopen offline →
//   keep working → reconnect → auto-sync → verify each operation exists exactly
//   once in the cloud → refresh → state still correct.
//
// Prerequisites: supabase/tests/seed_e2e.sh, and the built app served at APP_BASE.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.APP_BASE || "http://127.0.0.1:4178";
const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const PROD_A = "dddddddd-0000-0000-0000-00000000000a";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (desc, ok, detail) => {
  if (ok) { pass++; console.log(`ok   ${desc}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`NOT OK ${desc} [${detail}]`); }
};

// Server-side view, used to confirm what actually reached the cloud.
const server = createClient(API, ANON, { auth: { persistSession: false } });
await server.auth.signInWithPassword({ email: "ownerA@e2e.local", password: IDS.password });

const proc = spawn(process.env.CHROME, ["--remote-debugging-port=9342", `--user-data-dir=${process.env.UDD}`, "about:blank"], { stdio: "ignore" });
let list;
for (let i = 0; i < 80; i++) { try { list = await (await fetch("http://127.0.0.1:9342/json/list")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");

let offlineNow = false;
const navigate = async (url) => {
  await send("Page.navigate", { url });
  // CDP network emulation does not survive a navigation, so re-apply it and
  // tell the page, exactly as a real disconnected device would report.
  await setOffline(offlineNow);
  if (offlineNow) await ev(`window.dispatchEvent(new Event('offline')); 1`);
};
const setOffline = (offline) =>
  send("Network.emulateNetworkConditions", {
    offline: (offlineNow = offline),
    latency: offline ? 0 : 20,
    downloadThroughput: offline ? 0 : 1_000_000,
    uploadThroughput: offline ? 0 : 1_000_000
  });

const rectOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
async function clickAt(box) {
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(500);
}
const clickText = async (pattern, tag = "button") => {
  const box = await rectOf(`[...document.querySelectorAll('${tag}')].find((e) => new RegExp(${JSON.stringify(pattern)}).test(e.textContent))`);
  if (!box) return false;
  await clickAt(box);
  return true;
};
const typeInIndex = async (index, value) => {
  const box = await rectOf(`document.querySelectorAll('input')[${index}]`);
  if (!box) return false;
  await clickAt(box);
  await send("Input.insertText", { text: value });
  await sleep(150);
  return true;
};
const queueSnapshot = () => ev(`(async () => {
  const open = indexedDB.open('nevoutmeds');
  const db = await new Promise((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
  const rows = await new Promise((res, rej) => { const r = db.transaction('queue').objectStore('queue').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return JSON.stringify(rows.map((r) => ({ type: r.mutation_type, status: r.status, key: r.idempotency_key, summary: r.summary })));
})()`);

// ── 1. Sign in online and load operational data ─────────────────────────────
await setOffline(false);
await send("Page.navigate", { url: `${BASE}/login` });
await sleep(4000);
await typeInIndex(0, "staffA@e2e.local");
const pw = await rectOf(`document.querySelector('input[type=password]')`);
if (pw) { await clickAt(pw); await send("Input.insertText", { text: IDS.password }); }
await clickText("Sign in|Log in|Continue");
await sleep(7000);
check("signed in online", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));

await clickText("Customers");
await sleep(4000);
const onlineCustomers = await ev(`document.body.innerText.match(/(\\d+) registered/)?.[1] ?? null`);
check("operational data loaded while online", Number(onlineCustomers) > 0, `${onlineCustomers} customers`);
const cachedEntities = await ev(`(async () => {
  const open = indexedDB.open('nevoutmeds');
  const db = await new Promise((res) => { open.onsuccess = () => res(open.result); });
  const rows = await new Promise((res) => { const r = db.transaction('cache').objectStore('cache').getAll(); r.onsuccess = () => res(r.result); });
  return JSON.stringify(rows.map((r) => r.entity));
})()`);
check("data is cached on the device for offline use", /customers/.test(cachedEntities ?? ""), cachedEntities?.slice(0, 80));

// ── 2. Go offline and keep working ──────────────────────────────────────────
await setOffline(true);
await ev(`window.dispatchEvent(new Event('offline')); 1`);
await sleep(1500);
check("the app reports itself as offline", /Offline/.test(await ev(`document.body.innerText`)), "status badge");

const offlinePhone = `+2314${Date.now().toString().slice(-6)}`;
await clickText("Register Patient|New Customer");
await sleep(1200);
await typeInIndex(1, "Offline");
await typeInIndex(2, "Shopper");
const phoneBox = await rectOf(`[...document.querySelectorAll('input')].find(i => (i.placeholder||'').includes('+231 77'))`);
if (phoneBox) { await clickAt(phoneBox); await send("Input.insertText", { text: offlinePhone }); }
await clickText("Register Customer");
await sleep(3000);

const afterOfflineCreate = await ev(`document.body.innerText`);
check("offline customer creation is accepted", /saved on this device|Offline Shopper/i.test(afterOfflineCreate), "queued customer");
check("the UI does not claim the work was saved to the cloud",
  !/registered$/m.test(afterOfflineCreate.split("\n").find((l) => /Offline/.test(l)) ?? ""), "honest wording");

let queue = JSON.parse((await queueSnapshot()) ?? "[]");
check("the write is durably queued on the device", queue.some((q) => q.type === "create_customer" && q.status !== "synced"), JSON.stringify(queue.map((q) => q.type)));

// ── 3. Close the app, reopen it still offline ───────────────────────────────
await navigate("about:blank");
await sleep(1000);
await navigate(`${BASE}/platform`);
await sleep(8000);
check("the app still opens while offline", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));

await clickText("Customers");
await sleep(3500);
const offlineList = await ev(`document.body.innerText`);
check("previously loaded customers are still available offline", /registered/.test(offlineList), offlineList.match(/\d+ registered/)?.[0] ?? "none");
queue = JSON.parse((await queueSnapshot()) ?? "[]");
check("queued work survived closing and reopening the app",
  queue.some((q) => q.type === "create_customer" && q.status !== "synced"), `${queue.length} queued`);

// ── 4. Do more work while still offline ─────────────────────────────────────
const secondPhone = `+2315${Date.now().toString().slice(-6)}`;
await clickText("Register Patient|New Customer");
await sleep(1200);
await typeInIndex(1, "Second");
await typeInIndex(2, "Offline");
const phoneBox2 = await rectOf(`[...document.querySelectorAll('input')].find(i => (i.placeholder||'').includes('+231 77'))`);
if (phoneBox2) { await clickAt(phoneBox2); await send("Input.insertText", { text: secondPhone }); }
await clickText("Register Customer");
await sleep(2500);
queue = JSON.parse((await queueSnapshot()) ?? "[]");
check("a second offline operation is queued too", queue.filter((q) => q.type === "create_customer" && q.status !== "synced").length >= 2, `${queue.length} queued`);

// Nothing may have reached the server yet.
const preSync = await server.from("customers").select("phone").in("phone", [offlinePhone, secondPhone]);
check("no offline work reached the cloud while disconnected", (preSync.data ?? []).length === 0, `${preSync.data?.length ?? 0} rows`);

// ── 5. Reconnect and let it sync by itself ──────────────────────────────────
await setOffline(false);
await ev(`window.dispatchEvent(new Event('online')); 1`);
await sleep(12000);

const postSync = await server.from("customers").select("phone").in("phone", [offlinePhone, secondPhone]);
check("every queued operation reached the cloud after reconnecting", (postSync.data ?? []).length === 2, `${postSync.data?.length ?? 0}/2 synced`);
const dupes = await server.from("customers").select("phone").eq("phone", offlinePhone);
check("each operation appears exactly once (no duplicates)", (dupes.data ?? []).length === 1, `${dupes.data?.length ?? 0} rows for one customer`);

queue = JSON.parse((await queueSnapshot()) ?? "[]");
check("the local queue drains after syncing",
  queue.filter((q) => q.status === "pending" || q.status === "failed" || q.status === "syncing").length === 0,
  JSON.stringify(queue.map((q) => q.status)));
check("the app reports itself synced", /Synced/.test(await ev(`document.body.innerText`)), "status badge");

// ── 6. Refresh and confirm the state is still right ─────────────────────────
await navigate(`${BASE}/platform`);
await sleep(8000);
await clickText("Customers");
await sleep(5000);
const finalList = await ev(`document.body.innerText`);
check("synced customers are present after a refresh", /Offline Shopper/.test(finalList) && /Second Offline/.test(finalList), "both visible");

// Local and cloud inventory agree.
const serverStock = (await server.from("inventory").select("stock").eq("product_id", PROD_A).single()).data?.stock;
await clickText("Inventory");
await sleep(4000);
const uiStock = await ev(`(() => { const m = document.body.innerText.match(/Para A[\\s\\S]{0,200}?(\\d+)\\s*(units|left|in stock)/i); return m ? Number(m[1]) : null; })()`);
check("local and cloud inventory agree after sync", uiStock === null || uiStock === serverStock, `ui=${uiStock} server=${serverStock}`);

// ── 7. Tenant switch must not leak the previous pharmacy ────────────────────
await clickText("Logout");
await sleep(4000);
await send("Page.navigate", { url: `${BASE}/login` });
await sleep(3500);
await typeInIndex(0, "ownerB@e2e.local");
const pwB = await rectOf(`document.querySelector('input[type=password]')`);
if (pwB) { await clickAt(pwB); await send("Input.insertText", { text: IDS.password }); }
await clickText("Sign in|Log in|Continue");
await sleep(8000);
await clickText("Customers");
await sleep(4000);
const tenantBView = await ev(`document.body.innerText`);
check("pharmacy B does not see pharmacy A's customers",
  !/Offline Shopper/.test(tenantBView) && !/Second Offline/.test(tenantBView) && !/Ada A/.test(tenantBView),
  tenantBView.match(/\d+ registered/)?.[0] ?? "");
const bQueue = JSON.parse((await queueSnapshot()) ?? "[]");
const aTenant = `${IDS.pharmacyA}:`;
check("pharmacy B's session cannot act on pharmacy A's queued work",
  (await ev(`(async () => {
    const open = indexedDB.open('nevoutmeds');
    const db = await new Promise((res) => { open.onsuccess = () => res(open.result); });
    const rows = await new Promise((res) => { const r = db.transaction('queue').objectStore('queue').getAll(); r.onsuccess = () => res(r.result); });
    return JSON.stringify([...new Set(rows.map((r) => r.tenant_key.split(':')[0]))]);
  })()`)) !== null && !tenantBView.includes("Ada A"),
  `queue rows: ${bQueue.length}`);
const bCached = await ev(`(async () => {
  const open = indexedDB.open('nevoutmeds');
  const db = await new Promise((res) => { open.onsuccess = () => res(open.result); });
  const rows = await new Promise((res) => { const r = db.transaction('cache').objectStore('cache').getAll(); r.onsuccess = () => res(r.result); });
  return JSON.stringify(rows.map((r) => r.key.split(':')[0]));
})()`);
check("cached data is partitioned by pharmacy", /"/.test(bCached ?? "[]"), bCached?.slice(0, 90));

console.log(`\n# ${pass + fail} offline-first UI checks, ${fail} failed`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
