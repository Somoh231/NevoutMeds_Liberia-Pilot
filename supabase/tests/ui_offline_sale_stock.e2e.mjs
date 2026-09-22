// NevOut Meds — Phase 7: the two field-critical offline workflows, driven
// entirely through the production UI (no IndexedDB or API shortcuts).
//
//   A. record a sale while offline
//   B. adjust stock while offline
//
// Each: offline → do the work in the real screen → close app → reopen offline →
// reconnect → sync → assert the server has it EXACTLY once → reload → still correct.
//
// Prerequisites: supabase/tests/seed_e2e.sh, built app served at APP_BASE.
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

const server = createClient(API, ANON, { auth: { persistSession: false } });
await server.auth.signInWithPassword({ email: "ownerA@e2e.local", password: IDS.password });
const stockNow = async () => (await server.from("inventory").select("stock").eq("product_id", PROD_A).single()).data?.stock;
const purchaseCount = async () => (await server.from("purchases").select("id", { count: "exact", head: true })).count;
const movementCount = async (note) => (await server.from("stock_movements").select("id", { count: "exact", head: true }).eq("product_id", PROD_A).eq("note", note)).count;

const proc = spawn(process.env.CHROME, ["--remote-debugging-port=9352", `--user-data-dir=${process.env.UDD}`, "about:blank"], { stdio: "ignore" });
let list;
for (let i = 0; i < 80; i++) { try { list = await (await fetch("http://127.0.0.1:9352/json/list")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");

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
  await sleep(500);
}
const clickText = async (pattern, tag = "button") => {
  const box = await rectOf(`[...document.querySelectorAll('${tag}')].find((e) => new RegExp(${JSON.stringify(pattern)}).test(e.textContent))`);
  if (!box) return false;
  await clickAt(box);
  return true;
};
// React-controlled <select>: set the value natively and fire the change event.
const selectOption = (selectIndex, matcher) => ev(`(() => {
  const sel = document.querySelectorAll('select')[${selectIndex}];
  if (!sel) return null;
  const opt = [...sel.options].find((o) => ${matcher});
  if (!opt) return null;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, opt.value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return opt.textContent;
})()`);
const queueRows = async () => JSON.parse((await ev(`(async () => {
  const open = indexedDB.open('nevoutmeds');
  const db = await new Promise((res) => { open.onsuccess = () => res(open.result); });
  const rows = await new Promise((res) => { const r = db.transaction('queue').objectStore('queue').getAll(); r.onsuccess = () => res(r.result); });
  return JSON.stringify(rows.map((r) => ({ type: r.mutation_type, status: r.status, key: r.idempotency_key })));
})()`)) ?? "[]");

// ── Sign in and load inventory ──────────────────────────────────────────────
await setOffline(false);
await send("Page.navigate", { url: `${BASE}/login` });
await sleep(4000);
const emailBox = await rectOf(`document.querySelectorAll('input')[0]`);
if (emailBox) { await clickAt(emailBox); await send("Input.insertText", { text: "staffA@e2e.local" }); }
const pwBox = await rectOf(`document.querySelector('input[type=password]')`);
if (pwBox) { await clickAt(pwBox); await send("Input.insertText", { text: IDS.password }); }
await clickText("Sign in|Log in|Continue");
await sleep(7000);
check("signed in for the offline workflows", (await ev(`location.pathname`)) === "/platform", await ev(`location.pathname`));

await clickText("Inventory");
await sleep(4000);
await clickText("Customers");
await sleep(4000);
check("inventory and customers loaded while online", /registered/.test(await ev(`document.body.innerText`)), "loaded");

const stockBeforeSale = await stockNow();
const purchasesBeforeSale = await purchaseCount();

// ══ A. OFFLINE SALE ═════════════════════════════════════════════════════════
await setOffline(true);
await ev(`window.dispatchEvent(new Event('offline')); 1`);
await sleep(1500);
check("A1 · app shows Offline before the sale", /Offline/.test(await ev(`document.body.innerText`)), "status badge");

// Open a customer card, then the sale form — the real workflow.
const custCard = await rectOf(`[...document.querySelectorAll('div')].find((d) => /📞/.test(d.textContent) && d.textContent.length < 400)`);
if (custCard) await clickAt(custCard);
await sleep(800);
check("A2 · sale form opens from the customer card", await clickText("\\+ Sale"), "");
await sleep(1200);

const chosen = await selectOption(0, `/Para A/.test(o.textContent)`);
check("A3 · a product can be chosen from cached inventory while offline", !!chosen, chosen ?? "no options");
await sleep(500);
const qtyBox = await rectOf(`[...document.querySelectorAll('input')].find((i) => i.type === 'number')`);
if (qtyBox) { await clickAt(qtyBox); await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Control" }); await ev(`document.activeElement.select(); 1`); await send("Input.insertText", { text: "2" }); }
await sleep(400);
await clickText("Record Purchase|Confirm|Save");
// Sample while the toast is still on screen (it auto-dismisses after ~3.2s).
await sleep(1200);
const afterSaleText = await ev(`document.body.innerText`);
await sleep(2500);
check("A4 · UI reports the sale as saved on the device, not as a server success",
  /saved on this device/i.test(afterSaleText) && !/Purchase recorded —/.test(afterSaleText), "honest wording");

let q = await queueRows();
check("A5 · the sale is durably queued", q.some((r) => r.type === "record_purchase" && r.status !== "synced"), JSON.stringify(q.map((r) => r.type)));
check("A6 · nothing reached the server while offline", (await purchaseCount()) === purchasesBeforeSale, `${purchasesBeforeSale}`);

await clickText("Inventory");
await sleep(2500);
const pendingStockView = await ev(`document.body.innerText`);
check("A7 · stock shows a safe local pending state", /Pending sync/i.test(pendingStockView), "pending marker");

// Close and reopen while still offline.
await navigate("about:blank");
await sleep(800);
await navigate(`${BASE}/platform`);
await sleep(8000);
q = await queueRows();
check("A8 · the queued sale survives closing and reopening the app",
  q.some((r) => r.type === "record_purchase" && r.status !== "synced"), `${q.length} queued`);

// Reconnect and let the engine drain.
await setOffline(false);
await ev(`window.dispatchEvent(new Event('online')); 1`);
await sleep(12000);

check("A9 · exactly one purchase reached the database", (await purchaseCount()) === purchasesBeforeSale + 1, `${purchasesBeforeSale} -> ${await purchaseCount()}`);
const stockAfterSale = await stockNow();
check("A10 · stock changed exactly once (−2)", stockAfterSale === stockBeforeSale - 2, `${stockBeforeSale} -> ${stockAfterSale}`);
q = await queueRows();
check("A11 · the sale left the queue", !q.some((r) => r.type === "record_purchase" && r.status !== "synced"), JSON.stringify(q.map((r) => r.status)));

await navigate(`${BASE}/platform`);
await sleep(7000);
check("A12 · state is still correct after a reload", (await stockNow()) === stockBeforeSale - 2 && (await purchaseCount()) === purchasesBeforeSale + 1, "server state stable");

// ══ B. OFFLINE STOCK ADJUSTMENT ═════════════════════════════════════════════
const noteText = `offline count ${Date.now().toString().slice(-5)}`;

await clickText("Inventory");
await sleep(4000);
await setOffline(true);
await ev(`window.dispatchEvent(new Event('offline')); 1`);
await sleep(1500);
check("B1 · app shows Offline before the adjustment", /Offline/.test(await ev(`document.body.innerText`)), "status badge");

// The adjust control is the small pencil button on the product row.
const adjustBtn = await rectOf(`(() => {
  const row = [...document.querySelectorAll('div')].find((d) => /Para A/.test(d.textContent) && d.querySelector('button'));
  return row ? [...row.querySelectorAll('button')].pop() : null;
})()`);
if (adjustBtn) await clickAt(adjustBtn);
await sleep(1500);
const dialogText = await ev(`document.body.innerText`);
check("B2 · the stock adjustment dialog opens", /Adjust Stock/i.test(dialogText), "dialog");

// Assert against whichever product the dialog actually opened: the row order
// depends on the data in the project, so the product must not be assumed.
const adjustedName = (dialogText.match(/Adjust Stock\s*\n\s*([^\n·]+)·/) ?? [])[1]?.trim() ?? null;
const adjustedProduct = adjustedName
  ? (await server.from("products").select("id,name").eq("name", adjustedName).limit(1)).data?.[0]
  : null;
check("B2b · the test knows which product is being adjusted", !!adjustedProduct, adjustedName ?? "unknown");
const adjStockNow = async () => (await server.from("inventory").select("stock").eq("product_id", adjustedProduct.id).single()).data?.stock;
const adjMovementCount = async (note) =>
  (await server.from("stock_movements").select("id", { count: "exact", head: true })
    .eq("product_id", adjustedProduct.id).eq("note", note)).count;

const stockBeforeAdj = adjustedProduct ? await adjStockNow() : null;
const numBox = await rectOf(`[...document.querySelectorAll('input')].find((i) => i.type === 'number')`);
if (numBox) { await clickAt(numBox); await ev(`document.activeElement.select(); 1`); await send("Input.insertText", { text: "6" }); }
const noteBox = await rectOf(`document.querySelector('textarea')`);
if (noteBox) { await clickAt(noteBox); await send("Input.insertText", { text: noteText }); }
await sleep(400);
await clickText("Apply|Save|Update|Confirm");
await sleep(1200);
const afterAdjText = await ev(`document.body.innerText`);
await sleep(2500);
check("B3 · the adjustment is reported as saved on the device",
  /saved on this device/i.test(afterAdjText), "honest wording");
q = await queueRows();
check("B4 · the adjustment is durably queued", q.some((r) => r.type === "adjust_stock" && r.status !== "synced"), JSON.stringify(q.map((r) => r.type)));
check("B5 · the server has not moved yet", (await adjStockNow()) === stockBeforeAdj, `${stockBeforeAdj}`);

await navigate("about:blank");
await sleep(800);
await navigate(`${BASE}/platform`);
await sleep(8000);
q = await queueRows();
check("B6 · the queued adjustment survives a restart", q.some((r) => r.type === "adjust_stock" && r.status !== "synced"), `${q.length} queued`);

await setOffline(false);
await ev(`window.dispatchEvent(new Event('online')); 1`);
await sleep(12000);

check("B7 · the adjustment synced exactly once", (await adjMovementCount(noteText)) === 1, `${await adjMovementCount(noteText)} movements`);
check("B8 · server stock reflects the adjustment once (+6)", (await adjStockNow()) === stockBeforeAdj + 6, `${stockBeforeAdj} -> ${await adjStockNow()}`);
q = await queueRows();
check("B9 · the queue drained", !q.some((r) => r.status === "pending" || r.status === "failed" || r.status === "syncing"), JSON.stringify(q.map((r) => r.status)));

await navigate(`${BASE}/platform`);
await sleep(7000);
await clickText("Inventory");
await sleep(4000);
check("B10 · final state is correct after reload",
  (await adjStockNow()) === stockBeforeAdj + 6 && (await adjMovementCount(noteText)) === 1, "server state stable");

console.log(`\n# ${pass + fail} offline sale/stock UI checks, ${fail} failed`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
