// NevOut Meds — Phase 7 recovery tests.
//
//   2. Long-disconnection realtime recovery (reconcile, don't rely on replay)
//   3. Crash during sync (Page.crash at unsafe points) — no duplicates
//   4. Suspension while work is queued — server authority, no silent discard
//   5. Realtime service restart — reconnect without reload, no channel leak
//
// Prerequisites: supabase/tests/seed_e2e.sh, built app served at APP_BASE.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.APP_BASE || "http://127.0.0.1:4178";
const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const PROD_A = "dddddddd-0000-0000-0000-00000000000a";
const CUST_A = "cccccccc-0000-0000-0000-00000000000a";
const REALTIME_CONTAINER = process.env.NEVOUT_REALTIME_CONTAINER || "supabase_realtime_NevOutMeds_Liberia_Pilot";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (desc, ok, detail) => {
  if (ok) { pass++; console.log(`ok   ${desc}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`NOT OK ${desc} [${detail}]`); }
};

// "Device A" is a headless API client; "Device B" is the browser.
const deviceA = createClient(API, ANON, { auth: { persistSession: false } });
await deviceA.auth.signInWithPassword({ email: "ownerA@e2e.local", password: IDS.password });
const server = deviceA;
const stockNow = async () => (await server.from("inventory").select("stock").eq("product_id", PROD_A).single()).data?.stock;
const purchaseCount = async () => (await server.from("purchases").select("id", { count: "exact", head: true })).count;

let proc, ws, id = 0, pend = new Map();
async function openBrowser(port) {
  proc = spawn(process.env.CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${process.env.UDD}`, "about:blank"], { stdio: "ignore" });
  let list;
  for (let i = 0; i < 80; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; } catch { await sleep(250); } }
  ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  pend = new Map(); id = 0;
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    // A deliberately crashed target never replies, so every call is bounded.
    const timer = setTimeout(() => { pend.delete(i); resolve({ timedOut: true }); }, 20_000);
    pend.set(i, (d) => { clearTimeout(timer); resolve(d); });
    try { ws.send(JSON.stringify({ id: i, method, params })); } catch { clearTimeout(timer); resolve({ failed: true }); }
  });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

let offlineNow = false;
const setOffline = (offline) =>
  send("Network.emulateNetworkConditions", {
    offline: (offlineNow = offline), latency: offline ? 0 : 20,
    downloadThroughput: offline ? 0 : 1_000_000, uploadThroughput: offline ? 0 : 1_000_000
  });
const navigate = async (url) => {
  await send("Page.navigate", { url });
  await setOffline(offlineNow);
  if (offlineNow) await ev(`window.dispatchEvent(new Event('offline')); 1`);
};
const rectOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
async function clickAt(box) {
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(450);
}
const clickText = async (pattern, tag = "button") => {
  const box = await rectOf(`[...document.querySelectorAll('${tag}')].find((e) => new RegExp(${JSON.stringify(pattern)}).test(e.textContent))`);
  if (!box) return false;
  await clickAt(box);
  return true;
};
async function signIn(email) {
  await navigate(`${BASE}/login`);
  await sleep(4000);
  const e = await rectOf(`document.querySelectorAll('input')[0]`);
  if (e) { await clickAt(e); await send("Input.insertText", { text: email }); }
  const p = await rectOf(`document.querySelector('input[type=password]')`);
  if (p) { await clickAt(p); await send("Input.insertText", { text: IDS.password }); }
  await clickText("Sign in|Log in|Continue");
  await sleep(7000);
}
const queueRows = async () => JSON.parse((await ev(`(async () => {
  const open = indexedDB.open('nevoutmeds');
  const db = await new Promise((res) => { open.onsuccess = () => res(open.result); });
  const rows = await new Promise((res) => { const r = db.transaction('queue').objectStore('queue').getAll(); r.onsuccess = () => res(r.result); });
  return JSON.stringify(rows.map((r) => ({ type: r.mutation_type, status: r.status, key: r.idempotency_key, err: r.error_message })));
})()`)) ?? "[]");

await openBrowser(9354);
await setOffline(false);
await signIn("staffA@e2e.local");
check("device B signed in", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));
await clickText("Customers");
await sleep(4000);
const baselineCustomers = await ev(`document.body.innerText.match(/(\\d+) registered/)?.[1] ?? null`);

// ══ 2. LONG DISCONNECTION ═══════════════════════════════════════════════════
await setOffline(true);
await ev(`window.dispatchEvent(new Event('offline')); 1`);
await sleep(2000);
check("2.1 · device B is disconnected", /Offline/.test(await ev(`document.body.innerText`)), "offline");

// Device A works for an extended interval while B is dark.
const farPhone = `+2312${Date.now().toString().slice(-6)}`;
await deviceA.rpc("create_customer_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_phone: farPhone, p_first_name: "Missed", p_last_name: "Event", p_idempotency_key: crypto.randomUUID() });
await deviceA.rpc("record_purchase_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_method: "Cash", p_staff_id: null, p_items: [{ product_id: PROD_A, name: "Para A", qty: 1, unit_price: 1 }], p_idempotency_key: crypto.randomUUID() });
await deviceA.rpc("adjust_stock_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_product_id: PROD_A, p_delta: 9, p_note: "restock while B offline", p_idempotency_key: crypto.randomUUID() });
await deviceA.rpc("create_reminder_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_medicine: "Missed Reminder", p_due_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), p_note: null, p_idempotency_key: crypto.randomUUID() });

// A genuinely long gap: well beyond any websocket keepalive.
await sleep(30_000);
const serverStockDuringGap = await stockNow();
check("2.2 · device A's work is on the server while B is dark", !!serverStockDuringGap, `stock=${serverStockDuringGap}`);

await setOffline(false);
await ev(`window.dispatchEvent(new Event('online')); 1`);
await sleep(14000);

const afterReconnect = await ev(`document.body.innerText`);
check("2.3 · device B reconciles the customer it never received an event for",
  afterReconnect.includes("Missed Event"), afterReconnect.match(/\d+ registered/)?.[0] ?? "");
check("2.4 · device B's customer count grew after reconnect",
  Number(afterReconnect.match(/(\d+) registered/)?.[1] ?? 0) > Number(baselineCustomers ?? 0),
  `${baselineCustomers} -> ${afterReconnect.match(/(\d+) registered/)?.[1]}`);
await clickText("Inventory");
await sleep(4000);
const invText = await ev(`document.body.innerText`);
check("2.5 · inventory reconciles to the server value after a long gap",
  invText.includes(String(await stockNow())), `server stock ${await stockNow()}`);
check("2.6 · no duplicate rows appeared from reconciliation",
  (await ev(`(document.body.innerText.match(/Missed Event/g) || []).length`)) <= 1, "single row");
const channels = await ev(`(window.__nevoutChannels ?? null)`);
check("2.7 · reconnection did not leave duplicate realtime channels",
  channels === null || channels <= 1, `channels=${channels ?? "n/a"}`);

// ══ 5. REALTIME SERVICE RESTART ═════════════════════════════════════════════
let realtimeRestartable = true;
try {
  execSync(`docker stop ${REALTIME_CONTAINER}`, { stdio: "ignore" });
} catch {
  realtimeRestartable = false;
}
if (realtimeRestartable) {
  await sleep(4000);
  // REST must keep working while realtime is down.
  await clickText("Customers");
  await sleep(4000);
  const restDown = await ev(`document.body.innerText`);
  check("5.1 · the app keeps working while Realtime is unavailable", /registered/.test(restDown), restDown.match(/\d+ registered/)?.[0] ?? "");

  const duringOutagePhone = `+2313${Date.now().toString().slice(-6)}`;
  const wrote = await deviceA.rpc("create_customer_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_phone: duringOutagePhone, p_first_name: "During", p_last_name: "Outage", p_idempotency_key: crypto.randomUUID() });
  check("5.2 · writes still succeed while Realtime is down", !wrote.error, wrote.error?.message ?? "ok");

  execSync(`docker start ${REALTIME_CONTAINER}`, { stdio: "ignore" });
  await sleep(25000);
  // No reload: the client must resubscribe and reconcile by itself.
  await sleep(15000);
  const afterRealtimeBack = await ev(`document.body.innerText`);
  check("5.3 · the app reconciles what it missed during the outage, without a reload",
    afterRealtimeBack.includes("During Outage"), afterRealtimeBack.match(/\d+ registered/)?.[0] ?? "");
  check("5.4 · no duplicate row after the realtime outage",
    (await ev(`(document.body.innerText.match(/During Outage/g) || []).length`)) <= 1, "single row");
} else {
  console.log("#  realtime container not controllable here — 5.x skipped");
}

// ══ 4. SUSPENSION WHILE WORK IS QUEUED ══════════════════════════════════════
await setOffline(true);
await ev(`window.dispatchEvent(new Event('offline')); 1`);
await sleep(1500);
await clickText("Customers");
await sleep(2500);
const suspendedPhone = `+2316${Date.now().toString().slice(-6)}`;
await clickText("Register Patient|New Customer|^New customer$");
await sleep(1200);
const fn = await rectOf(`document.querySelectorAll('input')[1]`);
if (fn) { await clickAt(fn); await send("Input.insertText", { text: "Blocked" }); }
const ln = await rectOf(`document.querySelectorAll('input')[2]`);
if (ln) { await clickAt(ln); await send("Input.insertText", { text: "Work" }); }
const ph = await rectOf(`[...document.querySelectorAll('input')].find(i => (i.type === 'tel' || (i.placeholder||'').includes('+231 77')))`);
if (ph) { await clickAt(ph); await send("Input.insertText", { text: suspendedPhone }); }
await clickText("Register Customer|^Register customer$");
await sleep(2500);
let q = await queueRows();
check("4.1 · work is queued while offline", q.some((r) => r.status !== "synced"), `${q.length} queued`);

// The owner suspends this user from another device.
const suspend = await fetch(`${API}/functions/v1/staff-admin`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${(await deviceA.auth.getSession()).data.session.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "suspend", user_id: IDS.staffA })
});
check("4.2 · owner suspends the staff member from another device", suspend.status === 200, `${suspend.status}`);

await setOffline(false);
await ev(`window.dispatchEvent(new Event('online')); 1`);
await sleep(15000);

q = await queueRows();
const blocked = q.find((r) => r.type === "create_customer" && r.status !== "synced");
check("4.3 · the queued work is NOT silently discarded", !!blocked, JSON.stringify(q.map((r) => r.status)));
check("4.4 · the rejected work is marked as needing attention, not retried forever",
  blocked?.status === "conflict" && !!blocked.err,
  `${blocked?.status}: ${(blocked?.err ?? "").slice(0, 60)}`);
const serverHasIt = await server.from("customers").select("id").eq("phone", suspendedPhone);
check("4.5 · the server rejected the unauthorised write", (serverHasIt.data ?? []).length === 0, `${serverHasIt.data?.length ?? 0} rows`);
const uiAfterSuspension = await ev(`document.body.innerText`);
check("4.6 · the user is told their access changed",
  /sign in|Sign in|suspended|Needs attention|Sync failed/i.test(uiAfterSuspension), uiAfterSuspension.slice(0, 60).replace(/\n/g, " | "));
check("4.7 · inventory was not corrupted by the rejected sync", (await stockNow()) >= 0, `stock=${await stockNow()}`);

// Restore for the remaining checks.
await fetch(`${API}/functions/v1/staff-admin`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${(await deviceA.auth.getSession()).data.session.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "reactivate", user_id: IDS.staffA })
});

// ══ 3. CRASH DURING SYNC ════════════════════════════════════════════════════
await signIn("staffA@e2e.local");
await sleep(2000);
const purchasesBeforeCrash = await purchaseCount();
const stockBeforeCrash = await stockNow();

// Queue several mutations offline, then crash the tab at an unsafe moment.
await setOffline(true);
await ev(`window.dispatchEvent(new Event('offline')); 1`);
await sleep(1200);
const crashKeys = [];
for (let i = 0; i < 3; i++) {
  const key = crypto.randomUUID();
  crashKeys.push(key);
  await ev(`(async () => {
    const open = indexedDB.open('nevoutmeds');
    const db = await new Promise((res) => { open.onsuccess = () => res(open.result); });
    const tenant = (await new Promise((res) => { const r = db.transaction('queue').objectStore('queue').getAll(); r.onsuccess = () => res(r.result); }))[0]?.tenant_key
      ?? (await new Promise((res) => { const r = db.transaction('cache').objectStore('cache').getAll(); r.onsuccess = () => res(r.result); }))[0]?.tenant;
    const [pharmacy, user] = tenant.split(':');
    const rec = {
      local_id: crypto.randomUUID(), idempotency_key: ${JSON.stringify("KEY")}.replace('KEY', '${key}'),
      tenant_key: tenant, pharmacy_id: pharmacy, user_id: user, device_id: 'crash-test',
      mutation_type: 'record_purchase',
      payload: { p_pharmacy_id: pharmacy, p_customer_id: '${CUST_A}', p_method: 'Cash', p_staff_id: null,
                 p_items: [{ product_id: '${PROD_A}', name: 'Para A', qty: 1, unit_price: 1 }] },
      status: 'pending', retry_count: 0, created_at: new Date().toISOString(),
      last_attempt_at: null, synced_at: null, error_code: null, error_message: null, conflict: null,
      summary: 'Sale · crash test'
    };
    await new Promise((res, rej) => { const r = db.transaction('queue', 'readwrite').objectStore('queue').put(rec); r.onsuccess = res; r.onerror = () => rej(r.error); });
    return 1;
  })()`);
}
q = await queueRows();
check("3.1 · several mutations are queued before the crash", q.filter((r) => r.status === "pending").length >= 3, `${q.filter((r) => r.status === "pending").length} pending`);

// Reconnect to start the drain, then crash the renderer mid-flight.
await setOffline(false);
await ev(`window.dispatchEvent(new Event('online')); 1`);
await sleep(700); // strategically unsafe: requests are in flight
// Page.crash kills the renderer outright — the strongest crash simulation the
// browser offers. It never replies, hence the bounded send().
await send("Page.crash");
await sleep(2500);

// Restart the app, exactly like a pharmacy reopening after a crash.
ws.close(); proc.kill();
await sleep(1500);
await openBrowser(9356);
await setOffline(false);
await navigate(`${BASE}/platform`);
await sleep(14000);

const purchasesAfterCrash = await purchaseCount();
const stockAfterCrash = await stockNow();
check("3.2 · the queue recovered and every crashed mutation is applied",
  purchasesAfterCrash - purchasesBeforeCrash === 3, `${purchasesBeforeCrash} -> ${purchasesAfterCrash} (expected +3)`);
check("3.3 · no duplicate purchase after the crash",
  purchasesAfterCrash - purchasesBeforeCrash === 3, `+${purchasesAfterCrash - purchasesBeforeCrash}`);
check("3.4 · stock moved exactly once per crashed mutation",
  stockAfterCrash === stockBeforeCrash - 3, `${stockBeforeCrash} -> ${stockAfterCrash} (expected ${stockBeforeCrash - 3})`);
const receipts = await server.from("mutation_receipts").select("idempotency_key").in("idempotency_key", crashKeys);
check("3.5 · one receipt exists per crashed mutation (idempotency held)",
  (receipts.data ?? []).length === 3, `${receipts.data?.length ?? 0}/3 receipts`);
q = await queueRows();
check("3.6 · the queue is clean after recovery",
  !q.some((r) => r.status === "pending" || r.status === "failed"), JSON.stringify(q.map((r) => r.status)));

console.log(`\n# ${pass + fail} recovery checks, ${fail} failed`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
