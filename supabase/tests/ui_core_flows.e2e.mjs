// NevOut Meds — Phase 8 core product experience: task flows per gate.
//
// Real tasks through the redesigned UI at 360 px and laptop width, with the
// server checked as ground truth: find a product, adjust stock, reorder into a
// real purchase order, record a sale, add a customer, compare suppliers, act on
// expiry, read cash exposure. Every redesigned screen is also checked for
// horizontal panning, cut-off text and axe (WCAG 2.2 AA) critical/serious issues.
//
// Usage: APP_BASE=… NEVOUT_API_URL=… CHROME=… UDD=… OUT=… [GATES=A,B] node supabase/tests/ui_core_flows.e2e.mjs
// Synthetic data only: fixtures are created in the E2E pharmacy by name, once.
import { IDS, api, apiLogin, browser, reporter, sleep } from "./lib/harness.mjs";

const GATES = (process.env.GATES ?? "A,B,C,D,E").split(",");
const { check, done } = reporter();
const owner = api(await apiLogin("ownerA@e2e.local"));
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ── Synthetic fixtures (idempotent by name) ────────────────────────────────
const FIXTURES = [
  { name: "Fixture Amoxicillin 250mg", category: "Antibiotic", stock: 3, reorder: 10, max: 60, velocity: 2, cost: 0.8, price: 1.5, expiry: day(20), batch: "FX-A1" },
  { name: "Fixture Metformin 500mg", category: "Diabetes", stock: 9, reorder: 10, max: 80, velocity: 0.5, cost: 0.3, price: 0.6, expiry: day(75), batch: "FX-M2" },
  { name: "Fixture ORS Sachet", category: "Rehydration", stock: 40, reorder: 10, max: 60, velocity: 1, cost: 0.2, price: 0.5, expiry: day(400), batch: "FX-O3" },
  { name: "Fixture Expired Syrup", category: "Cough", stock: 6, reorder: 2, max: 20, velocity: 0.2, cost: 1.2, price: 2.5, expiry: day(-5), batch: "FX-E4" }
];
async function ensureFixtures() {
  const existing = await owner.rest(`products?select=id,name&pharmacy_id=eq.${IDS.pharmacyA}&name=like.Fixture*`);
  const byName = Object.fromEntries((Array.isArray(existing) ? existing : []).map((p) => [p.name, p.id]));
  for (const f of FIXTURES) {
    if (byName[f.name]) continue;
    const r = await owner.rpc("create_product", {
      p_pharmacy_id: IDS.pharmacyA, p_name: f.name, p_category: f.category, p_unit_cost: f.cost, p_selling_price: f.price,
      p_stock: f.stock, p_brand: null, p_unit: "tablets", p_reorder_point: f.reorder, p_max_stock: f.max, p_daily_velocity: f.velocity,
      p_batch_id: f.batch, p_expiry_date: f.expiry, p_is_essential: true, p_requires_prescription: f.category === "Antibiotic"
    });
    byName[f.name] = r.body;
  }
  // Put each fixture back at its starting stock so every run is deterministic.
  for (const f of FIXTURES) {
    const cur = (await owner.rest(`inventory?select=stock&product_id=eq.${byName[f.name]}`))?.[0]?.stock ?? f.stock;
    if (cur !== f.stock) await owner.rpc("adjust_stock", { p_pharmacy_id: IDS.pharmacyA, p_product_id: byName[f.name], p_delta: f.stock - cur, p_note: "test fixture reset" });
  }
  return byName;
}
const fixtureIds = await ensureFixtures();
const AMOX = fixtureIds["Fixture Amoxicillin 250mg"];
const stockOf = async (pid) => (await owner.rest(`inventory?select=stock&product_id=eq.${pid}`))?.[0]?.stock;
const orderCount = async () => (await owner.rest(`purchase_orders?select=id&pharmacy_id=eq.${IDS.pharmacyA}`))?.length ?? 0;

const b = await browser({ port: 9410, out: process.env.OUT });
await b.reset();
await b.viewport("laptop");
check("owner signs in", (await b.signIn("ownerA@e2e.local")) === "/platform", await b.ev(`location.pathname`));

async function layoutChecks(label, screens, viewports = ["360", "390", "430"]) {
  const pans = [], clips = [];
  for (const vp of viewports) {
    await b.viewport(vp);
    await b.go("/platform", 3500);
    for (const s of screens) {
      await b.open(s);
      const p = await b.pan();
      if (p > 0) pans.push(`${s}@${vp}:${p}px`);
      const c = await b.clipped();
      if (c) clips.push(`${s}@${vp}: ${c}`);
      if (vp === "360") await b.shot(`${label}__${s}__360`);
    }
  }
  check(`${label}: no horizontal pan at ${viewports.join("/")}`, pans.length === 0, pans.join(", ") || "0 px");
  check(`${label}: no cut-off text at ${viewports.join("/")}`, clips.length === 0, clips.join(" || ") || "none");
}
async function axeChecks(label, screens) {
  const bad = [];
  for (const vp of ["360", "laptop"]) {
    await b.viewport(vp);
    await b.go("/platform", 3500);
    for (const s of screens) {
      await b.open(s);
      const a = await b.axe(["main"]);
      if (a.serious.length) bad.push(`${s}@${vp}: ${a.text}`);
      if (vp === "laptop") await b.shot(`${label}__${s}__laptop`);
    }
  }
  check(`${label}: axe finds no critical/serious issues in screen content`, bad.length === 0, bad.join(" || ") || "none");
}

// ═══ GATE A · Morning briefing + Inventory ═══════════════════════════════════
if (GATES.includes("A")) {
  await b.viewport("laptop");
  await b.go("/platform", 4500);
  const dash = await b.mainText();
  check("A1 briefing leads with today's date and what needs attention", dash.includes(new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) && /Needs attention/.test(dash), dash.slice(0, 80).replace(/\n/g, " | "));
  check("A2 a critically low product is surfaced with its name", /out of stock or critically low/.test(dash) && /Fixture Amoxicillin/.test(dash), "restock item");
  check("A3 expiry exposure is surfaced with value at risk", /expires? within 30 days/.test(dash), "expiry item");
  check("A4 today's sales and credit exposure are shown from real data", /Sales today/.test(dash) && /Customer credit outstanding/.test(dash), "metrics");
  // The navigation badge must count exactly what Inventory calls "Needs attention".
  const badge = Number((await b.ev(`document.querySelector('[data-nav-id="inventory"] .nv-nav__count, [data-nav-id="inventory"] .nv-rail__count')?.textContent ?? '0'`)).replace(/\D.*$/, "") || 0);
  await b.open("inventory");
  const attention = Number((await b.ev(`[...document.querySelectorAll('.nv-chip')].find(c => /Needs attention/.test(c.textContent))?.querySelector('.nv-num')?.textContent ?? '-1'`)));
  check("A5b the navigation badge equals Inventory's 'Needs attention' count", badge === attention && attention > 0, `badge ${badge} vs ${attention}`);
  await b.open("dashboard");
  check("A5 no invented benchmarks or projections on the briefing", !/regional|benchmark|projected|forecast/i.test(dash), "none");
  // The most urgent item is one tap from its fix.
  await b.click(`document.querySelector('.nv-brief-top')`);
  await sleep(2000);
  check("A6 briefing action opens Inventory filtered to what needs attention",
    /Inventory/.test(await b.ev(`document.querySelector('h1').textContent`)) && (await b.ev(`[...document.querySelectorAll('.nv-chip')].find(c => /Needs attention/.test(c.textContent))?.getAttribute('aria-pressed')`)) === "true",
    await b.ev(`document.querySelector('h1').textContent`));

  // Phone: find → detail → adjust → reorder, with the server as ground truth.
  await b.viewport("360");
  await b.go("/platform", 3500);
  await b.open("inventory");
  await b.fill(`document.querySelector('input[type=search]')`, "Fixture Amox");
  await sleep(500);
  check("A7 search finds the product on a 360 px phone", (await b.ev(`document.querySelectorAll('[role=listitem]').length`)) === 1, `${await b.ev(`document.querySelectorAll('[role=listitem]').length`)} rows`);
  const row = await b.mainText();
  check("A8 a row shows stock, days of stock and expiry at a glance", /\d+ tablets/.test(row) && /1 days left|days left/.test(row) && /expires/.test(row), row.split("\n").slice(-4).join(" | "));
  await b.click(`document.querySelector('.nv-row__main')`);
  await sleep(800);
  const drawer = await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`);
  check("A9 product detail shows reorder, value, expiry and stock history", /Suggested reorder/.test(drawer) && /Value in stock/.test(drawer) && /Stock history/.test(drawer), "detail sheet");
  await b.shot("gateA__product-detail__360");
  const before = await stockOf(AMOX);
  await b.clickText("^Adjust stock$", "document.querySelector('dialog[open]')");
  await sleep(600);
  check("A10 adjust opens from the detail sheet", /Adjust Stock/.test(await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`)), "dialog");
  await b.click(`document.querySelector('dialog[open] button[aria-label="Add 1"]')`);
  await b.clickText("^Delivery received$", "document.querySelector('dialog[open]')");
  await b.clickText("Apply adjustment", "document.querySelector('dialog[open]')");
  let adjusted = false;
  for (let i = 0; i < 20 && !adjusted; i++) { await sleep(500); adjusted = (await stockOf(AMOX)) === before + 1; }
  check("A11 a +1 adjustment reaches the server exactly once", adjusted, `${before} → ${await stockOf(AMOX)}`);

  const ordersBefore = await orderCount();
  await b.go("/platform", 3500);
  await b.open("inventory");
  await b.fill(`document.querySelector('input[type=search]')`, "Fixture Amox");
  await sleep(500);
  await b.click(`document.querySelector('button[aria-label^="Reorder Fixture Amoxicillin"]')`);
  await sleep(1200);
  const reorder = await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`);
  check("A12 reorder suggests a quantity and shows the price source honestly", /Suggested:/.test(reorder) && /(recorded price|recorded unit cost)/.test(reorder), reorder.slice(0, 80).replace(/\n/g, " | "));
  await b.shot("gateA__reorder__360");
  await b.clickText("^Create order$", "document.querySelector('dialog[open]')");
  const recorded = await b.waitFor(`/Order recorded|Pending sync/.test(document.querySelector('dialog[open]')?.innerText ?? '')`, 12000);
  const after = await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`);
  check("A13 creating the order records it and says nothing was sent yet", recorded && /Nothing has been sent/.test(after), after.slice(0, 90).replace(/\n/g, " | "));
  check("A14 the purchase order exists on the server", (await orderCount()) === ordersBefore + 1, `${ordersBefore} → ${await orderCount()}`);
  check("A15 sending is an explicit WhatsApp step, never claimed as done", (await b.ev(`!!document.querySelector('dialog[open] a[href^="https://wa.me/"]')`)) || /no WhatsApp or phone number/.test(after), "wa.me link or copy instruction");
  await b.shot("gateA__order-recorded__360");
  await b.press("Escape");

  await layoutChecks("gateA", ["dashboard", "inventory"]);
  await axeChecks("gateA", ["dashboard", "inventory"]);
}

// ═══ GATE B · Sales + Customers + Reminders ══════════════════════════════════
if (GATES.includes("B")) {
  const ORS = fixtureIds["Fixture ORS Sachet"];
  const purchaseCount = async () => (await owner.rest(`purchases?select=id&pharmacy_id=eq.${IDS.pharmacyA}`))?.length ?? 0;
  const queue = () => b.ev(`(async () => { const open = indexedDB.open('nevoutmeds'); const db = await new Promise(r => { open.onsuccess = () => r(open.result); }); return JSON.stringify(await new Promise(r => { const q = db.transaction('queue').objectStore('queue').getAll(); q.onsuccess = () => r(q.result.map(x => ({ type: x.mutation_type, status: x.status }))); })); })()`).then((t) => JSON.parse(t ?? "[]"));

  async function saleOnSalesScreen(customerName, productQuery, qty) {
    await b.go("/platform", 3500);
    await b.open("sales");
    await b.fill(`document.querySelector('main input[aria-label="Find customer"]')`, customerName);
    await sleep(300);
    await b.click(`[...document.querySelectorAll('main ul[aria-label="Matching customers"] button')][0]`);
    await b.fill(`document.querySelector('main input[aria-label="Find a product"]')`, productQuery);
    await sleep(300);
    await b.press("Enter"); // Enter adds the top match
    await sleep(300);
    if (qty > 1) { await b.fill(`document.querySelector('main input[type=number]')`, String(qty)); }
    await b.clickText("^Record sale$", "document.querySelector('main')");
  }

  // B1 · online sale from the Sales screen, few taps, server as ground truth.
  await b.viewport("360");
  const pBefore = await purchaseCount();
  const sBefore = await stockOf(ORS);
  await saleOnSalesScreen("Ada", "Fixture ORS", 2);
  const ok = await b.waitFor(`/Sale recorded · Synced/.test(document.querySelector('main').innerText)`, 12000);
  check("B1 online sale on a 360 px phone ends in 'Sale recorded · Synced'", ok, (await b.mainText()).match(/Sale recorded[^\n]*|Saved on this device[^\n]*/)?.[0] ?? "no result");
  check("B2 exactly one purchase and −2 stock on the server", (await purchaseCount()) === pBefore + 1 && (await stockOf(ORS)) === sBefore - 2, `purchases ${pBefore}→${await purchaseCount()}, stock ${sBefore}→${await stockOf(ORS)}`);
  await b.shot("gateB__sale-synced__360");

  // B3 · the same flow offline is visibly different and honest.
  await b.go("/platform", 3500);
  await b.open("sales");
  await b.offline(true);
  await sleep(800);
  await b.fill(`document.querySelector('main input[aria-label="Find customer"]')`, "Ada");
  await sleep(300);
  await b.click(`[...document.querySelectorAll('main ul[aria-label="Matching customers"] button')][0]`);
  await b.fill(`document.querySelector('main input[aria-label="Find a product"]')`, "Fixture ORS");
  await sleep(300);
  await b.press("Enter");
  await b.clickText("^Record sale$", "document.querySelector('main')");
  const pend = await b.waitFor(`/Saved on this device · Pending sync/.test(document.querySelector('main').innerText)`, 8000);
  const offText = await b.mainText();
  check("B3 offline sale says 'Saved on this device · Pending sync', never 'Synced'", pend && !/Sale recorded · Synced/.test(offText), offText.match(/Saved on this device[^\n]*/)?.[0] ?? "");
  check("B4 the pending result uses the pending tone, distinct from synced", await b.ev(`!!document.querySelector('main .nv-alert.nv-tone-pending') && !document.querySelector('main .nv-alert.nv-tone-success')`), "tone classes");
  check("B5 the offline sale is durably queued", (await queue()).some((r) => r.type === "record_purchase" && r.status !== "synced"), JSON.stringify(await queue()));
  await b.shot("gateB__sale-pending__360");
  const pOff = await purchaseCount();
  await b.offline(false);
  let synced = false;
  for (let i = 0; i < 30 && !synced; i++) { await sleep(500); synced = (await purchaseCount()) === pOff + 1; }
  check("B6 on reconnect the sale reaches the server exactly once", synced && (await purchaseCount()) === pOff + 1, `${pOff}→${await purchaseCount()}`);

  // B7 · register a customer on a phone (name + phone only), server as truth.
  const phone = `+2317${Date.now().toString().slice(-7)}`;
  await b.go("/platform", 3500);
  await b.open("customers");
  await b.clickText("^New customer$", "document.querySelector('main')");
  await sleep(600);
  await b.fill(`document.querySelector('dialog[open] input[autocomplete="given-name"]')`, "Gate");
  await b.fill(`document.querySelector('dialog[open] input[autocomplete="family-name"]')`, `B${Date.now() % 1000}`);
  await b.fill(`document.querySelector('dialog[open] input[type=tel]')`, phone);
  await b.press("Enter");
  let registered = false;
  for (let i = 0; i < 20 && !registered; i++) { await sleep(500); registered = ((await owner.rest(`customers?select=id,gender,county&phone=eq.${encodeURIComponent(phone)}`)) ?? []).length === 1; }
  check("B7 registering a customer with Enter persists it on the server", registered, phone);
  const saved = (await owner.rest(`customers?select=gender,county&phone=eq.${encodeURIComponent(phone)}`))?.[0];
  check("B8 no invented defaults are saved (gender, county stay empty)", saved && !saved.gender && !saved.county, JSON.stringify(saved));

  // B9 · customer detail shows credit and history without inventing data.
  await b.fill(`document.querySelector('main input[type=search]')`, "Ada");
  await sleep(400);
  await b.click(`document.querySelector('main .nv-row__main')`);
  await sleep(700);
  const det = await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`);
  check("B9 customer detail shows credit, refill reminders and purchase history", /Credit/.test(det) && /Refill reminders/.test(det) && /Purchase history/.test(det) && /repayments isn’t available/.test(det), "detail");
  await b.shot("gateB__customer-detail__360");
  await b.press("Escape");

  // B10 · reminders: an overdue one is actionable, WhatsApp is honest, marking is explicit.
  const cust = (await owner.rest(`customers?select=id,first_name&pharmacy_id=eq.${IDS.pharmacyA}&first_name=eq.Ada`))?.[0];
  await owner.rpc("create_reminder_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_customer_id: cust.id, p_medicine: "Gate B Refill", p_due_date: day(-3), p_note: null, p_idempotency_key: crypto.randomUUID() });
  await b.go("/platform", 4500);
  await b.open("reminders");
  const rem = await b.mainText();
  check("B10 an overdue reminder is listed first with how late it is", /Gate B Refill/.test(rem) && /Overdue/.test(rem) && /days? overdue/.test(rem), "overdue");
  check("B11 WhatsApp is an explicit 'Open WhatsApp' link to the customer, not 'sent'", await b.ev(`[...document.querySelectorAll('main a[href^="https://wa.me/"]')].some(a => /Open WhatsApp/.test(a.textContent))`), "wa.me link");
  await b.click(`[...document.querySelectorAll('main button')].find(x => /Mark .*Gate B Refill/.test(x.getAttribute('aria-label') ?? ''))`);
  let marked = false;
  for (let i = 0; i < 20 && !marked; i++) { await sleep(500); marked = (await owner.rest(`reminders?select=sent&medicine=eq.Gate%20B%20Refill&customer_id=eq.${cust.id}&sent=eq.true`))?.length > 0; }
  check("B12 'Mark as reminded' records it on the server", marked, "sent=true");
  await b.shot("gateB__reminders__360");

  await layoutChecks("gateB", ["sales", "customers", "reminders"]);
  await axeChecks("gateB", ["sales", "customers", "reminders"]);
}

// ═══ GATE C · Price compare + Suppliers + Purchase orders ════════════════════
if (GATES.includes("C")) {
  const AMOX_NAME = "Fixture Amoxicillin 250mg";
  // Synthetic suppliers and recorded prices (idempotent by name).
  async function supplier(name, extra = {}) {
    const found = await owner.rest(`suppliers?select=id&pharmacy_id=eq.${IDS.pharmacyA}&name=eq.${encodeURIComponent(name)}`);
    if (found?.[0]) return found[0].id;
    return (await owner.rest("suppliers", { method: "POST", body: JSON.stringify({ pharmacy_id: IDS.pharmacyA, name, ...extra }) }))?.[0]?.id;
  }
  async function price(supplierId, unit_cost, moq, stock_status, daysAgo = 0) {
    await owner.rest(`supplier_catalogue?pharmacy_id=eq.${IDS.pharmacyA}&supplier_id=eq.${supplierId}&product_name=eq.${encodeURIComponent(AMOX_NAME)}`, { method: "DELETE" });
    await owner.rest("supplier_catalogue", { method: "POST", body: JSON.stringify({ pharmacy_id: IDS.pharmacyA, supplier_id: supplierId, product_name: AMOX_NAME, unit_cost, moq, stock_status, unit: "tablets", is_active: true, updated_at: new Date(Date.now() - daysAgo * 86400000).toISOString() }) });
  }
  const sBest = await supplier("Fixture Wholesale Best", { whatsapp: "+231770000001", lead_days: 2, city: "Monrovia" });
  const sMoq = await supplier("Fixture Bulk Only", { lead_days: 5 });
  const sOut = await supplier("Fixture Out Of Stock", { lead_days: 1 });
  await price(sBest, 0.7, 10, "In stock");
  await price(sMoq, 0.6, 500, "In stock");          // cheaper per unit, but MOQ makes the order dearer
  await price(sOut, 0.4, null, "Out of stock", 60);  // cheapest, out of stock, recorded 60 days ago

  // C1 · the briefing surfaces the saving and jumps to the comparison for that product.
  await b.viewport("laptop");
  await b.go("/platform", 5000);
  check("C1 the briefing surfaces a real supplier saving", /Cheaper supplier price recorded/.test(await b.mainText()), "savings item");
  await b.click(`[...document.querySelectorAll('main button')].find(x => /Compare prices/.test(x.textContent))`);
  await sleep(2500);
  const selName = await b.ev(`(() => { const s = document.querySelector('main select'); return s?.options[s.selectedIndex]?.textContent ?? ''; })()`);
  check("C2 'Compare prices' opens Price compare with the product selected", /Suppliers/.test(await b.ev(`document.querySelector('h1').textContent`)) && selName.includes("Fixture"), selName);

  // C3 · compare on a phone: winner, honest gaps, MOQ and stock effects.
  await b.viewport("360");
  await b.go("/platform", 3500);
  await b.open("suppliers");
  await b.ev(`(() => { const s = document.querySelector('main select'); const o = [...s.options].find(o => o.textContent.startsWith(${JSON.stringify(AMOX_NAME)})); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await sleep(800);
  const cmp = await b.mainText();
  const bestCard = await b.ev(`document.querySelector('.nv-compare__card.is-best')?.innerText ?? ''`);
  check("C3 the recommended option is the lowest total that can fill the order", /Fixture Wholesale Best/.test(bestCard) && /Best recorded price/.test(bestCard), bestCard.split("\n").slice(0, 3).join(" | "));
  check("C4 a cheaper unit price raised by its minimum order is ranked by real total", /raised to the minimum order/.test(cmp), "MOQ explained");
  check("C5 an out-of-stock quote is flagged and cannot be ordered", /Recorded as out of stock/.test(cmp) && (await b.ev(`[...document.querySelectorAll('main button')].some(x => /Order from Fixture Out Of Stock/.test(x.textContent) && x.disabled)`)), "disabled");
  check("C6 unknown data says 'Not recorded' instead of being estimated", /Delivery cost\s*\n?\s*Not recorded/.test(cmp) && /Reliability\s*\n?\s*Not recorded/.test(cmp), "honest gaps");
  check("C7 an old price is marked as possibly out of date", /may be out of date/.test(cmp), "stale price");
  await b.shot("gateC__compare__360");

  // C8 · compare → choose → create order, server as ground truth.
  const before = await orderCount();
  await b.click(`[...document.querySelectorAll('main button')].find(x => /Order from Fixture Wholesale Best/.test(x.textContent))`);
  await sleep(1000);
  const dlg = await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`);
  check("C8 ordering carries the chosen supplier and quantity into the order", /Reorder Fixture Amoxicillin/.test(dlg) && (await b.ev(`(() => { const s = document.querySelector('dialog[open] select'); return s?.options[s.selectedIndex]?.textContent ?? ''; })()`)).includes("Fixture Wholesale Best"), "preset supplier");
  await b.clickText("^Create order$", "document.querySelector('dialog[open]')");
  await b.waitFor(`/Order recorded/.test(document.querySelector('dialog[open]')?.innerText ?? '')`, 12000);
  const mine = await owner.rest(`purchase_orders?select=id,supplier_id,total&pharmacy_id=eq.${IDS.pharmacyA}&order=created_at.desc&limit=1`);
  check("C9 the order exists on the server for the chosen supplier", (await orderCount()) === before + 1 && mine?.[0]?.supplier_id === sBest, `${before}→${await orderCount()}`);
  await b.press("Escape");

  // C10 · orders list and honest progress.
  await b.clickText("^Orders", "document.querySelector('main')");
  await sleep(1500);
  await b.click(`document.querySelector('main [role=listitem] .nv-row__main')`);
  await sleep(800);
  const od = await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`);
  check("C10 order detail shows lines, total and honest progress (no invented 'received')", /Order total/.test(od) && /Receiving isn’t recorded/.test(od) && /can’t see whether it was sent/.test(od), "steps");
  await b.shot("gateC__order-detail__360");
  await b.press("Escape");

  // C11 · offline order is pending, then syncs exactly once.
  await b.clickText("^Price compare$", "document.querySelector('main')");
  await sleep(600);
  await b.ev(`(() => { const s = document.querySelector('main select'); const o = [...s.options].find(o => o.textContent.startsWith(${JSON.stringify(AMOX_NAME)})); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await sleep(600);
  await b.offline(true);
  await sleep(800);
  const offBefore = await orderCount();
  await b.click(`[...document.querySelectorAll('main button')].find(x => /Order from Fixture Wholesale Best/.test(x.textContent))`);
  await sleep(900);
  await b.clickText("^Create order$", "document.querySelector('dialog[open]')");
  const pendingShown = await b.waitFor(`/Saved on this device · Pending sync/.test(document.querySelector('dialog[open]')?.innerText ?? '')`, 8000);
  check("C11 an offline order says 'Saved on this device · Pending sync'", pendingShown, "pending");
  await b.press("Escape");
  await b.clickText("^Orders", "document.querySelector('main')");
  await sleep(800);
  check("C12 the Orders list shows it as Pending sync", /Pending sync/.test(await b.mainText()), "pending row");
  await b.offline(false);
  let synced = false;
  for (let i = 0; i < 30 && !synced; i++) { await sleep(500); synced = (await orderCount()) === offBefore + 1; }
  check("C13 on reconnect the order is recorded exactly once", synced && (await orderCount()) === offBefore + 1, `${offBefore}→${await orderCount()}`);

  // C14 · record a supplier price (online), server as truth.
  await b.go("/platform", 3500);
  await b.open("suppliers");
  await b.clickText("^Record a price$", "document.querySelector('main')");
  await sleep(700);
  await b.ev(`(() => { const d = document.querySelector('dialog[open]'); const [sup, prod] = d.querySelectorAll('select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    set.call(sup, [...sup.options].find(o => o.textContent === 'Fixture Bulk Only').value); sup.dispatchEvent(new Event('change', { bubbles: true }));
    set.call(prod, ${JSON.stringify(AMOX_NAME)}); prod.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await b.fill(`document.querySelector('dialog[open] input[type=number]')`, "0.55");
  await b.press("Enter");
  let rec = false;
  for (let i = 0; i < 20 && !rec; i++) { await sleep(500); rec = Number((await owner.rest(`supplier_catalogue?select=unit_cost&supplier_id=eq.${sMoq}&product_name=eq.${encodeURIComponent(AMOX_NAME)}`))?.[0]?.unit_cost) === 0.55; }
  check("C14 recording a price updates the supplier's current price on the server", rec, "0.55");

  await layoutChecks("gateC", ["suppliers"]);
  await axeChecks("gateC", ["suppliers"]);
}

// ═══ GATE D · Expiry alerts + Analyst ════════════════════════════════════════
if (GATES.includes("D")) {
  const EXP = fixtureIds["Fixture Expired Syrup"];
  await b.viewport("laptop");
  await b.go("/platform", 5000);
  await b.click(`[...document.querySelectorAll('main button')].find(x => /Review expiry/.test(x.textContent))`);
  await sleep(2000);
  check("D1 the briefing's expiry item opens Expiry alerts", /Expiry/.test(await b.ev(`document.querySelector('h1').textContent`)), await b.ev(`document.querySelector('h1').textContent`));

  await b.viewport("360");
  await b.go("/platform", 3500);
  await b.open("expiry");
  const ex = await b.mainText();
  check("D2 products are grouped by urgency with value at risk", /Expired/.test(ex) && /Within 30 days/.test(ex) && /60–90 days/.test(ex) && /Already expired/.test(ex) && /Likely to expire unsold/.test(ex), "groups + metrics");
  check("D3 each item has a recommended action using supported workflows only", /(Dispense this batch first|Keep dispensing it first)/.test(ex) && /Remove from sale and record the write-off/.test(ex) && !/transfer (to|stock)/i.test(ex.replace(/Transfers to other pharmacies[^.]*\./, "")), "recommendations");
  check("D4 batch numbers are shown where recorded", /Batch FX-E4/.test(ex) && /Batch FX-A1/.test(ex), "batches");
  await b.shot("gateD__expiry__360");
  await b.click(`document.querySelector('main button[aria-label^="Record write-off for Fixture Expired Syrup"]')`);
  await sleep(700);
  const wo = await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`);
  const pre = await b.ev(`document.querySelector('dialog[open] input[type=number]')?.value`);
  check("D5 write-off opens the stock dialog pre-filled with the whole expired quantity", /Adjust Stock/.test(wo) && pre === "-6" && /Damaged or expired/.test(await b.ev(`document.querySelector('dialog[open] textarea')?.value ?? ''`)), `delta=${pre}`);
  await b.clickText("Apply adjustment", "document.querySelector('dialog[open]')");
  let zero = false;
  for (let i = 0; i < 20 && !zero; i++) { await sleep(500); zero = (await stockOf(EXP)) === 0; }
  const gone = await b.waitFor(`!/Fixture Expired Syrup/.test(document.querySelector('main').innerText)`, 6000);
  check("D6 the write-off reaches the server and the item leaves the expiry list", zero && gone, `stock=${await stockOf(EXP)}, listed=${!gone}`);

  await b.viewport("laptop");
  await b.go("/platform", 3500);
  await b.open("analytics");
  const an = await b.mainText();
  const lead = await b.ev(`document.querySelector('.nv-insight--lead')?.innerText ?? ''`);
  check("D7 the Analyst leads with one priority finding", !!lead && /Priority finding/.test(lead), lead.split("\n").slice(0, 2).join(" | "));
  check("D8 each finding states why it matters, the action, the effect and the evidence", ["Why it matters", "Recommended action", "Estimated effect", "Evidence"].every((k) => new RegExp(k, "i").test(lead)), "four parts");
  check("D9 no fabricated benchmarks and no claim to be AI", !/regional|benchmark|industry average|\bAI\b|interest rate/i.test(an), "none");
  const togg = await b.ev(`!!document.querySelector('.nv-insight-list__toggle')`);
  if (togg) { await b.click(`document.querySelector('.nv-insight-list__toggle')`); await sleep(300); }
  check("D10 other findings expand in place (aria-expanded)", !togg || (await b.ev(`document.querySelector('.nv-insight-list__toggle').getAttribute('aria-expanded')`)) === "true", togg ? "expanded" : "only one finding");
  const target = await b.ev(`document.querySelector('.nv-insight--lead button')?.textContent ?? ''`);
  await b.click(`document.querySelector('.nv-insight--lead button')`);
  await sleep(2000);
  check("D11 the priority finding links straight to where it is resolved", !!target && !/Analyst/.test(await b.ev(`document.querySelector('h1').textContent`)), `${target} → ${await b.ev(`document.querySelector('h1').textContent`)}`);
  await b.shot("gateD__analyst__laptop");

  await layoutChecks("gateD", ["expiry", "analytics"]);
  await axeChecks("gateD", ["expiry", "analytics"]);
}

// ═══ GATE E · Reports + Cash flow ════════════════════════════════════════════
if (GATES.includes("E")) {
  const sum30 = (await owner.rpc("financial_summary", { p_days: 30 })).body;
  const sum7 = (await owner.rpc("financial_summary", { p_days: 7 })).body;
  const money = (n) => `$${Number(n).toFixed(2)}`;
  await b.viewport("360");
  await b.go("/platform", 3500);
  await b.open("financials");
  await sleep(1500);
  const fin = await b.mainText();
  check("E1 Financials shows 30-day revenue equal to the server summary", fin.includes(money(sum30.revenue.total)) && /Revenue \(30d\)/.test(fin), money(sum30.revenue.total));
  const credit = (sum30.revenue.by_method.find((m) => m.method === "Credit")?.total ?? 0);
  check("E2 paid-now and on-credit split the revenue exactly", fin.includes(money(sum30.revenue.total - credit)) && fin.includes(money(credit)), `${money(sum30.revenue.total - credit)} + ${money(credit)}`);
  check("E3 untracked figures are declared, and no cash balance is estimated", /Not tracked yet/.test(fin) && /Operating expenses/.test(fin) && /Cash on hand/.test(fin) && /won’t estimate/.test(fin), "declared");
  check("E4 open orders and reorder needs are shown as needs, not debts", /Open purchase orders/.test(fin) && /not debts/.test(fin), "honest wording");
  await b.shot("gateE__financials__360");
  await b.click(`[...document.querySelectorAll('main [role=tab]')].find(t => /7 days/.test(t.textContent))`);
  await sleep(2500);
  check("E5 changing the period recalculates from the server (7 days)", (await b.mainText()).includes(money(sum7.revenue.total)) && /Revenue \(7d\)/.test(await b.mainText()), money(sum7.revenue.total));

  await b.viewport("laptop");
  await b.go("/platform", 3500);
  await b.open("reports");
  await sleep(2000);
  const rep = await b.mainText();
  check("E6 the sales report matches the server and compares with the previous period", rep.includes(money(sum30.revenue.total)) && /(vs previous 30 days|no sales in the previous period)/.test(rep), money(sum30.revenue.total));
  check("E7 the day chart has an accessible table behind it (30 rows)", (await b.ev(`document.querySelectorAll('main figure.nv-daybars table tbody tr').length`)) === 30, `${await b.ev(`document.querySelectorAll('main figure.nv-daybars table tbody tr').length`)} rows`);
  await b.ev(`document.querySelector('#rep-tab-sales').focus(); 1`);
  await b.press("ArrowRight");
  await sleep(1500);
  check("E8 report tabs work from the keyboard (arrow keys)", (await b.ev(`document.querySelector('#rep-tab-products').getAttribute('aria-selected')`)) === "true", "products tab");
  const prod = await b.mainText();
  check("E9 product performance lists real products with units and margin", /Top products by revenue/.test(prod) && /sold/.test(prod), prod.match(/Top products by revenue[\s\S]{0,80}/)?.[0]?.replace(/\n/g, " | "));
  const exportBtns = await b.ev(`[...document.querySelectorAll('main button')].filter(x => /Export CSV/.test(x.textContent)).length`);
  check("E10 reports can be exported (CSV)", exportBtns > 0, `${exportBtns} export button(s)`);
  for (const id of ["inventory", "buying", "suppliers", "customers", "expiry"]) {
    await b.ev(`document.querySelector('#rep-tab-${id}').click(); 1`);
    await sleep(700);
  }
  check("E11 every report renders", /Expiry exposure/.test(await b.mainText()), "all tabs visited");
  await b.shot("gateE__reports__laptop");

  await layoutChecks("gateE", ["financials", "reports"]);
  await axeChecks("gateE", ["financials", "reports"]);
}

const realExceptions = b.exceptions.filter((e) => !/Failed to fetch|NetworkError|Load failed/i.test(e));
check("no uncaught exceptions", realExceptions.length === 0, realExceptions.slice(0, 2).join(" | "));
b.close();
process.exit(done("core-flow checks") ? 1 : 0);
