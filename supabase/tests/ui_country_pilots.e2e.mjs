// NevOut Meds — Phase 9: synthetic multi-country pilots (Ghana, Kenya, Rwanda)
// plus the mandatory UTC-midnight checks for Liberia and Kenya.
//
// Real tasks through the UI, with the server as ground truth: money shows the
// pharmacy's own currency, sales are stamped with it, phone numbers follow the
// country, Price Compare never ranks unlike currencies, business days follow
// the pharmacy's timezone (not the device's), and tenants stay isolated.
//
// Needs migration 0018. Synthetic data only. Seeding is idempotent (fixed ids,
// lookups by name, upserts), so it can be re-run against a persistent backend.
// Runs against the local stack by default; a remote project needs the explicit
// opt-in NEVOUT_ALLOW_REMOTE_SYNTHETIC=1.
// Usage: APP_BASE=… NEVOUT_API_URL=… CHROME=… UDD=… OUT=… node supabase/tests/ui_country_pilots.e2e.mjs
import fs from "node:fs";
import { API, ANON, IDS, api, apiLogin, browser, reporter, sleep } from "./lib/harness.mjs";
import { ensureTotpFor } from "./lib/mfa.mjs";

if (API.includes("qohpyeqyveusnxhnbtxz") && process.env.NEVOUT_ALLOW_PRODUCTION_SEED !== "1") {
  console.error("refusing to seed synthetic tenants into PRODUCTION. Use a staging project (STAGING_SETUP.md).");
  process.exit(2);
}
if (!/127\.0\.0\.1|localhost/.test(API) && process.env.NEVOUT_ALLOW_REMOTE_SYNTHETIC !== "1") {
  console.error("ui_country_pilots seeds synthetic tenants with the service key: set NEVOUT_ALLOW_REMOTE_SYNTHETIC=1 to run it against a remote project.");
  process.exit(2);
}
const SERVICE = fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim();
const { check, done } = reporter();

// ── Synthetic pilot tenants (recreated each run; seed_e2e truncates pharmacies) ──
const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const svc = (p, init = {}) => fetch(`${API}/rest/v1/${p}`, { ...init, headers: { ...svcHeaders, Prefer: "return=representation,resolution=merge-duplicates", ...(init.headers || {}) } })
  .then(async (r) => { const t = await r.text(); let body; try { body = JSON.parse(t); } catch { body = t; } if (!r.ok) throw new Error(`${p}: ${r.status} ${t.slice(0, 200)}`); return body; });

async function ensureUser(email) {
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: "POST", headers: svcHeaders, body: JSON.stringify({ email, password: IDS.password, email_confirm: true }) });
  if (r.ok) return (await r.json()).id;
  const list = await (await fetch(`${API}/auth/v1/admin/users?per_page=1000`, { headers: svcHeaders })).json();
  return (list.users ?? list).find((u) => u.email === email).id;
}

const PILOTS = {
  GH: { id: "cccccccc-0000-0000-0000-0000000000a1", email: "ownergh@e2e.local", name: "Pilot Pharmacy Accra", customer: ["Ama", "Mensah", "+233200000001"], cost: 2, price: 5 },
  KE: { id: "cccccccc-0000-0000-0000-0000000000a2", email: "ownerke@e2e.local", name: "Pilot Pharmacy Nairobi", customer: ["Wanjiru", "Kamau", "+254700000001"], cost: 20, price: 35 },
  RW: { id: "cccccccc-0000-0000-0000-0000000000a3", email: "ownerrw@e2e.local", name: "Pilot Pharmacy Kigali", customer: ["Uwase", "Mugisha", "+250780000001"], cost: 150, price: 300 }
};

for (const [code, p] of Object.entries(PILOTS)) {
  p.owner = await ensureUser(p.email);
  // Country only: currency, timezone, locale and payment methods come from the
  // server registry (the trigger fills them), exactly as onboarding does.
  await svc("pharmacies?on_conflict=id", { method: "POST", body: JSON.stringify({ id: p.id, name: p.name, country_code: code }) });
  await svc("users_profiles?on_conflict=id", { method: "POST", body: JSON.stringify({ id: p.owner, pharmacy_id: p.id, role: "owner", name: `Owner ${code}`, email: p.email }) });
  // Owners must use two-step verification (Phase 11): give each pilot owner an authenticator.
  await ensureTotpFor(API, ANON, SERVICE, p.email, IDS.password, p.owner);
  const existing = await svc(`products?select=id&pharmacy_id=eq.${p.id}&name=eq.Pilot%20Paracetamol`);
  p.product = existing[0]?.id ?? (await svc("products", { method: "POST", body: JSON.stringify({ pharmacy_id: p.id, name: "Pilot Paracetamol", category: "Analgesic", unit: "tablets", unit_cost: p.cost, selling_price: p.price, reorder_point: 10, max_stock: 100, daily_velocity: 1 }) }))[0].id;
  await svc("inventory?on_conflict=pharmacy_id,product_id", { method: "POST", body: JSON.stringify({ pharmacy_id: p.id, product_id: p.product, stock: 50 }) });
  const [cust] = await svc("customers?on_conflict=pharmacy_id,phone", { method: "POST", body: JSON.stringify({ pharmacy_id: p.id, first_name: p.customer[0], last_name: p.customer[1], phone: p.customer[2] }) });
  p.customerId = cust.id;
}
// Ghana: one supplier quoting in cedi, one in US dollars (a real regional pattern).
const supplier = async (name, extra) => (await svc(`suppliers?select=id&pharmacy_id=eq.${PILOTS.GH.id}&name=eq.${encodeURIComponent(name)}`))[0]
  ?? (await svc("suppliers", { method: "POST", body: JSON.stringify({ pharmacy_id: PILOTS.GH.id, name, ...extra }) }))[0];
const ghLocal = await supplier("Accra Wholesale", { lead_days: 2, whatsapp: "+233200000009" });
const ghUsd = await supplier("Coastal Export", { lead_days: 7 });
if ((await svc(`supplier_catalogue?select=id&pharmacy_id=eq.${PILOTS.GH.id}&product_name=eq.Pilot%20Paracetamol`)).length < 2) {
  await svc("supplier_catalogue", { method: "POST", body: JSON.stringify([
    { pharmacy_id: PILOTS.GH.id, supplier_id: ghLocal.id, product_name: "Pilot Paracetamol", unit_cost: 1.8, currency: "GHS", unit: "tablets" },
    { pharmacy_id: PILOTS.GH.id, supplier_id: ghUsd.id, product_name: "Pilot Paracetamol", unit_cost: 0.12, currency: "USD", unit: "tablets" }
  ]) });
}

// Midnight fixtures, written with explicit instants.
const localMidnightUtc = (tz) => {
  // The instant local midnight began today in `tz`, computed in Node (ICU).
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset;
};
const keMidnight = localMidnightUtc("Africa/Nairobi");
const lrMidnight = localMidnightUtc("Africa/Monrovia");
// Earlier runs' boundary sales are removed so "today" totals stay exact.
for (const pat of ["Midnight test*", "UTC midnight*"]) {
  await fetch(`${API}/rest/v1/purchases?items_text=like.${encodeURIComponent(pat)}`, { method: "DELETE", headers: svcHeaders });
}
const sale = (pharmacy, customer, at, amount, items) => ({ pharmacy_id: pharmacy, customer_id: customer, purchased_at: new Date(at).toISOString(), items_text: items, amount, method: "Cash" });
await svc("purchases", { method: "POST", body: JSON.stringify([
  // Kenya (UTC+3): 00:30 Nairobi today = 21:30 UTC on the previous UTC date.
  sale(PILOTS.KE.id, PILOTS.KE.customerId, keMidnight + 30 * 60000, 70, "Midnight test after"),
  // 23:30 Nairobi yesterday: must not count as today.
  sale(PILOTS.KE.id, PILOTS.KE.customerId, keMidnight - 30 * 60000, 900, "Midnight test before")
]) });
const lrCustomer = (await svc(`customers?select=id&pharmacy_id=eq.${IDS.pharmacyA}&limit=1`))[0].id;
await svc("purchases", { method: "POST", body: JSON.stringify([
  // Liberia (UTC+0): one second either side of midnight.
  sale(IDS.pharmacyA, lrCustomer, lrMidnight - 1000, 111, "UTC midnight before"),
  sale(IDS.pharmacyA, lrCustomer, lrMidnight + 1000, 0.5, "UTC midnight after")
]) });

const tokens = {};
const pilotSales = async (code) => (await svc(`purchases?select=id&pharmacy_id=eq.${PILOTS[code].id}&items_text=like.*Pilot*`)).length;
const before = { GH: await pilotSales("GH"), RW: await pilotSales("RW") };
for (const [code, p] of Object.entries(PILOTS)) tokens[code] = api(await apiLogin(p.email));
const ownerA = api(await apiLogin("ownerA@e2e.local"));

// ── T · tenant isolation across countries (API ground truth) ───────────────
{
  const gh = tokens.GH;
  const own = await gh.rest(`pharmacies?select=id,country_code,default_currency,timezone`);
  check("T1 a Ghanaian owner sees only their own pharmacy", Array.isArray(own) && own.length === 1 && own[0].country_code === "GH" && own[0].default_currency === "GHS" && own[0].timezone === "Africa/Accra", JSON.stringify(own));
  const lrSales = await gh.rest(`purchases?select=id&pharmacy_id=eq.${IDS.pharmacyA}`);
  check("T2 a Ghanaian owner cannot read Liberian sales", Array.isArray(lrSales) && lrSales.length === 0, `${lrSales?.length} rows`);
  const cross = await gh.rpc("record_purchase_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_customer_id: lrCustomer, p_method: "Cash", p_staff_id: null, p_items: [{ product_id: null, name: "x", qty: 1, unit_price: 1 }], p_idempotency_key: `pilot-cross-${Date.now()}` });
  check("T3 a Ghanaian owner cannot record a sale in a Liberian pharmacy", cross.status >= 400 && /forbidden/.test(JSON.stringify(cross.body)), `${cross.status} ${JSON.stringify(cross.body).slice(0, 80)}`);
  const lrCfg = await ownerA.rest(`pharmacies?select=country_code,default_currency&id=eq.${IDS.pharmacyA}`);
  check("T4 the Liberian pilot is still LR / USD", lrCfg?.[0]?.country_code === "LR" && lrCfg?.[0]?.default_currency === "USD", JSON.stringify(lrCfg));
  // Settings: owner-only, locked after sales, every change audited, audit tenant-scoped.
  const staffA = api(await apiLogin("staffA@e2e.local"));
  const staffTry = await staffA.rpc("update_pharmacy_settings", { p_changes: { city: "Buchanan" } });
  check("T5 staff cannot change pharmacy settings", staffTry.status >= 400 && /owner only/.test(JSON.stringify(staffTry.body)), `${staffTry.status}`);
  const lock = await ownerA.rpc("update_pharmacy_settings", { p_changes: { country_code: "GH" } });
  check("T6 the Liberian pilot's country is locked after sales (55000)", lock.status >= 400 && lock.body?.code === "55000", `${lock.status} ${lock.body?.code}`);
  const lockCur = await ownerA.rpc("update_pharmacy_settings", { p_changes: { default_currency: "LRD" } });
  check("T7 …and so is its currency", lockCur.status >= 400 && lockCur.body?.code === "55000", `${lockCur.status} ${lockCur.body?.code}`);
  const auditBefore = (await ownerA.rest(`pharmacy_config_changes?select=id&field=eq.payment_methods`))?.length ?? 0;
  const set1 = await ownerA.rpc("update_pharmacy_settings", { p_changes: { payment_methods: ["Cash", "Mobile Money", "Credit", "Insurance", "Diaspora Pay", "Card"] } });
  const set2 = await ownerA.rpc("update_pharmacy_settings", { p_changes: { payment_methods: null } });
  const auditAfter = (await ownerA.rest(`pharmacy_config_changes?select=id&field=eq.payment_methods`))?.length ?? 0;
  check("T8 settings changes are audited (two payment-method changes logged)", set1.status === 200 && set2.status === 200 && auditAfter === auditBefore + 2, `${auditBefore} → ${auditAfter}`);
  const ghSeesAudit = await gh.rest(`pharmacy_config_changes?select=id&pharmacy_id=eq.${IDS.pharmacyA}`);
  check("T9 another tenant cannot read the Liberian audit log", Array.isArray(ghSeesAudit) && ghSeesAudit.length === 0, `${ghSeesAudit?.length} rows`);
  const ctx = await gh.rpc("pharmacy_country_context", {});
  check("T10 the country context is the caller's own (GH, GHS, locked or not)", ctx.body?.country_code === "GH" && ctx.body?.default_currency === "GHS", JSON.stringify(ctx.body).slice(0, 120));
  const usdSale = await gh.rpc("record_purchase_idempotent", { p_pharmacy_id: PILOTS.GH.id, p_customer_id: PILOTS.GH.customerId, p_method: "Cash", p_staff_id: null, p_items: [{ product_id: PILOTS.GH.product, name: "Pilot Paracetamol", qty: 1, unit_price: 5 }], p_idempotency_key: `pilot-usd-${Date.now()}`, p_currency: "USD" });
  check("X1 a sale priced in USD is refused by a GHS pharmacy as a conflict (409), not re-labelled", usdSale.status === 409, `${usdSale.status} ${usdSale.body?.message ?? ""}`);
  const other = await gh.rest(`supplier_catalogue`, { method: "POST", body: JSON.stringify({ pharmacy_id: PILOTS.GH.id, supplier_id: ghLocal.id, product_name: "Pilot ORS", unit_cost: 40, currency: "LRD" }) });
  check("X2 a Ghanaian supplier price can't be recorded in Liberian dollars", !Array.isArray(other), JSON.stringify(other).slice(0, 100));
}

const b = await browser({ port: 9430, out: process.env.OUT });
const bareDollar = /(^|[^A-Z$])\$\s?\d/; // "$12" without a country prefix
const mainNoBareDollar = async () => !bareDollar.test(await b.mainText());

// ── W1 · Ghana pilot (360 px phone) ────────────────────────────────────────
{
  await b.reset();
  await b.viewport("360");
  check("GH1 Ghanaian owner signs in", (await b.signIn(PILOTS.GH.email)) === "/platform", await b.ev(`location.pathname`));
  await b.open("sales");
  const chips = await b.ev(`JSON.stringify([...document.querySelectorAll('main input[name="sale-method"]')].map(i => i.value))`);
  check("GH2 the till offers Ghana's payment methods (no Liberia-only Diaspora Pay)", chips === JSON.stringify(["Cash", "Mobile Money", "Credit"]), chips);
  await b.fill(`document.querySelector('main input[aria-label="Find customer"]')`, "Ama");
  await sleep(300);
  await b.click(`[...document.querySelectorAll('main ul[aria-label="Matching customers"] button')][0]`);
  await b.fill(`document.querySelector('main input[aria-label="Find a product"]')`, "Pilot Para");
  await sleep(300);
  await b.press("Enter");
  await sleep(300);
  await b.fill(`document.querySelector('main input[type=number]')`, "2");
  await b.click(`[...document.querySelectorAll('main label.nv-chip')].find(l => l.textContent.trim() === 'Mobile Money')`);
  await b.clickText("^Record sale$", "document.querySelector('main')");
  const ok = await b.waitFor(`/Sale recorded · Synced/.test(document.querySelector('main').innerText)`, 12000);
  const res = await b.mainText();
  check("GH3 a Ghanaian sale is recorded and shown in cedi", ok && /GH₵10\.00/.test(res), (res.match(/GH₵[\d,.]+[^\n]*/) ?? ["no GH₵ amount"])[0]);
  const sales = await tokens.GH.rest(`purchases?select=amount,currency_code,method&items_text=like.*Pilot*&order=created_at.desc`);
  check("GH4 the server stamped the sale GHS (amount 10, Mobile Money)", sales?.length === before.GH + 1 && sales[0].currency_code === "GHS" && Number(sales[0].amount) === 10 && sales[0].method === "Mobile Money", JSON.stringify(sales?.[0]));
  check("GH5 no bare '$' anywhere on the Sales screen", await mainNoBareDollar(), "ambiguity-safe");
  await b.shot("pilot_gh__sale__360");

  // Register a customer by typing a local number.
  await b.go("/platform", 3000);
  await b.open("customers");
  await b.clickText("^New customer$", "document.querySelector('main')");
  await sleep(600);
  const hint = await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`);
  check("GH6 the phone hint is Ghana's, not Liberia's", /\+233/.test(hint) && !/\+231/.test(hint), (hint.match(/[^\n]*\+23\d[^\n]*/) ?? [""])[0]);
  const local = `024${String(Date.now()).slice(-7)}`;
  await b.fill(`document.querySelector('dialog[open] input[autocomplete="given-name"]')`, "Kofi");
  await b.fill(`document.querySelector('dialog[open] input[autocomplete="family-name"]')`, "Pilot");
  await b.fill(`document.querySelector('dialog[open] input[type=tel]')`, local);
  await b.ev(`document.querySelector('dialog[open] details')?.setAttribute('open', ''); 1`);
  await sleep(300);
  const labels = await b.ev(`[...document.querySelectorAll('dialog[open] label')].map(l => l.textContent.trim()).join('|')`);
  check("GH7 the address uses Ghana's labels (Region), stored in the same column", /Region/.test(labels) && !/County/.test(labels), labels.split("|").filter((l) => /Region|County|Area|landmark/i.test(l)).join(", "));
  await b.press("Enter");
  const e164 = `+233${local.slice(1)}`;
  let stored = null;
  for (let i = 0; i < 20 && !stored; i++) { await sleep(500); stored = (await tokens.GH.rest(`customers?select=phone&phone=eq.${encodeURIComponent(e164)}`))?.[0]?.phone ?? null; }
  check("GH8 a local number is stored in international form", stored === e164, `${local} → ${stored}`);

  // Price Compare with a cedi and a dollar quote: never ranked against each other.
  await b.go("/platform", 3000);
  await b.open("suppliers");
  await b.ev(`(() => { const t = [...document.querySelectorAll('[role=tab]')].find(x => /Price compare/i.test(x.textContent)); t?.click(); return 1; })()`);
  await sleep(800);
  await b.ev(`(() => { const s = document.querySelector('main select'); const o = [...s.options].find(o => o.textContent.startsWith('Pilot Paracetamol')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await sleep(800);
  const cmp = await b.mainText();
  const best = await b.ev(`document.querySelector('.nv-compare__card.is-best')?.innerText ?? ''`);
  const usdCard = await b.ev(`document.querySelector('ol[data-currency="USD"] .nv-compare__card')?.className ?? ''`);
  check("Q1 mixed-currency quotes are explained, not converted", /Prices are in different currencies/.test(cmp) && /never ranked against each other/.test(cmp), (cmp.match(/NevOut Meds doesn’t convert[^\n]*/) ?? ["no notice"])[0].slice(0, 120));
  check("Q2 the recommendation comes from the cedi group only", /Accra Wholesale/.test(best) && /GH₵1\.80/.test(best), best.split("\n").slice(0, 4).join(" | "));
  check("Q3 the US-dollar quote is shown in US$ and never marked best", usdCard && !/is-best/.test(usdCard) && /US\$0\.12/.test(cmp), usdCard);
  check("Q4 the dollar quote isn't compared with the cedi unit cost", /priced in USD, not comparable/.test(cmp), "no false saving");
  await b.shot("pilot_gh__compare__360");

  // Order from the recommended supplier: the order carries the quote's currency.
  const posBefore = (await tokens.GH.rest(`purchase_orders?select=id`))?.length ?? 0;
  await b.click(`document.querySelector('.nv-compare__card.is-best button.nv-btn--primary')`);
  await sleep(900);
  await b.clickText("^Create order$", "document.querySelector('dialog[open]')");
  let po = null;
  for (let i = 0; i < 20 && !po; i++) { await sleep(500); const rows = await tokens.GH.rest(`purchase_orders?select=currency,total&order=created_at.desc`); if ((rows?.length ?? 0) > posBefore) po = rows[0]; }
  check("Q5 an order placed from the cedi quote is recorded in GHS", po?.currency === "GHS", JSON.stringify(po));

  // Settings: the country is locked after the first sale; methods are editable.
  await b.go("/platform", 3000);
  await b.open("settings");
  const set = await b.mainText();
  check("GH9 Settings shows Ghana and locks the country after the first sale", (await b.ev(`document.querySelector('main select[data-field="country"]')?.disabled === true`)) && /locked/i.test(set), (set.match(/[^\n]*[Ll]ocked[^\n]*/) ?? [""])[0]);
  await b.ev(`(() => { const t = [...document.querySelectorAll('[role=tab]')].find(x => /Money/.test(x.textContent)); t?.click(); return 1; })()`);
  await sleep(500);
  const money = await b.mainText();
  check("GH10 tax is marked as unverified — no rate is shown", /has not been verified/.test(money) && !/\d+(\.\d+)?\s?%/.test(money), (money.match(/How VAT[^\n]*/) ?? [""])[0].slice(0, 100));
  check("GH11 Settings don't pan on a 360 px phone", (await b.pan()) === 0, `${await b.pan()} px`);
  await b.shot("pilot_gh__settings-money__360");

  // Financials agree with the server, in cedi.
  const summary = (await tokens.GH.rpc("financial_summary", { p_days: 30 })).body;
  await b.open("financials");
  const fin = await b.mainText();
  check("GH12 Financials show the server's GHS revenue", summary?.currency === "GHS" && fin.includes(`GH₵${Number(summary.revenue.total).toFixed(2)}`) && !bareDollar.test(fin), `server ${summary?.currency} ${summary?.revenue?.total}`);
  await b.shot("pilot_gh__financials__360");
}

// ── W2 · Kenya pilot: business day follows Nairobi, not the device ─────────
{
  await b.reset();
  await b.viewport("laptop");
  // The device thinks it is in New York (UTC-4/-5); the pharmacy is in Nairobi (UTC+3).
  await b.send("Emulation.setTimezoneOverride", { timezoneId: "America/New_York" });
  check("KE1 Kenyan owner signs in (device clock set to New York)", (await b.signIn(PILOTS.KE.email)) === "/platform", await b.ev(`location.pathname`));
  const deviceTz = await b.ev(`Intl.DateTimeFormat().resolvedOptions().timeZone`);
  const nairobiDate = await b.ev(`new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' })`);
  const dash = await b.text();
  check("KE2 the dashboard date is Nairobi's, not the device's", deviceTz === "America/New_York" && dash.includes(nairobiDate), `device ${deviceTz}; expected "${nairobiDate}"`);
  await b.open("sales");
  const s = await b.mainText();
  check("W-MIDNIGHT-1 a sale at 00:30 Nairobi (21:30 UTC the day before) counts as today", /Midnight test after/.test(s) && /KSh 70\.00/.test(s), (s.match(/[^\n]*recorded ·[^\n]*/) ?? [""])[0]);
  check("W-MIDNIGHT-2 a sale at 23:30 Nairobi yesterday does not", !/Midnight test before/.test(s) && !/KSh 900/.test(s), "excluded");
  const sum = (await tokens.KE.rpc("financial_summary", { p_days: 7 })).body;
  check("W-MIDNIGHT-3 the server agrees: today = KSh 70 on the Nairobi business date", Number(sum?.revenue?.today) === 70 && sum?.timezone === "Africa/Nairobi", `${sum?.business_date} today=${sum?.revenue?.today}`);
  await b.send("Emulation.setTimezoneOverride", { timezoneId: "" });
  await b.shot("pilot_ke__sales__laptop");
}

// ── W3 · Rwanda pilot: a currency with no minor unit ──────────────────────
{
  await b.reset();
  await b.viewport("390");
  check("RW1 Rwandan owner signs in", (await b.signIn(PILOTS.RW.email)) === "/platform", await b.ev(`location.pathname`));
  await b.open("sales");
  await b.fill(`document.querySelector('main input[aria-label="Find customer"]')`, "Uwase");
  await sleep(300);
  await b.click(`[...document.querySelectorAll('main ul[aria-label="Matching customers"] button')][0]`);
  await b.fill(`document.querySelector('main input[aria-label="Find a product"]')`, "Pilot Para");
  await sleep(300);
  await b.press("Enter");
  await b.clickText("^Record sale$", "document.querySelector('main')");
  const ok = await b.waitFor(`/Sale recorded · Synced/.test(document.querySelector('main').innerText)`, 12000);
  const res = await b.mainText();
  check("RW2 Rwandan francs are shown without decimals", ok && /FRw 300(?![.,]\d)/.test(res) && !/FRw 300\.00/.test(res), (res.match(/FRw [\d,]+[^\n]*/) ?? ["no FRw amount"])[0]);
  const rs = await tokens.RW.rest(`purchases?select=amount,currency_code&items_text=like.*Pilot*&order=created_at.desc`);
  check("RW3 the server stamped the sale RWF", rs?.length === before.RW + 1 && rs[0].currency_code === "RWF" && Number(rs[0].amount) === 300, JSON.stringify(rs?.[0]));
  await b.shot("pilot_rw__sale__390");

  // S · offline: the queued sale carries its currency and syncs as RWF.
  await b.go("/platform", 3000);
  await b.open("sales");
  await b.offline(true);
  await sleep(600);
  await b.fill(`document.querySelector('main input[aria-label="Find customer"]')`, "Uwase");
  await sleep(300);
  await b.click(`[...document.querySelectorAll('main ul[aria-label="Matching customers"] button')][0]`);
  await b.fill(`document.querySelector('main input[aria-label="Find a product"]')`, "Pilot Para");
  await sleep(300);
  await b.press("Enter");
  await b.clickText("^Record sale$", "document.querySelector('main')");
  await b.waitFor(`/Saved on this device · Pending sync/.test(document.querySelector('main').innerText)`, 8000);
  const queued = await b.ev(`(async () => { const open = indexedDB.open('nevoutmeds'); const db = await new Promise(r => { open.onsuccess = () => r(open.result); }); return JSON.stringify(await new Promise(r => { const q = db.transaction('queue').objectStore('queue').getAll(); q.onsuccess = () => r(q.result.filter(x => x.mutation_type === 'record_purchase').map(x => x.payload?.p_currency ?? null)); })); })()`);
  check("S1 a sale queued offline keeps the currency it was priced in", JSON.parse(queued ?? "[]").includes("RWF"), queued);
  await b.offline(false);
  let n = 0;
  for (let i = 0; i < 30 && n < before.RW + 2; i++) { await sleep(500); n = (await tokens.RW.rest(`purchases?select=id&currency_code=eq.RWF&items_text=like.*Pilot*`))?.length ?? 0; }
  await sleep(1500);
  n = (await tokens.RW.rest(`purchases?select=id&currency_code=eq.RWF&items_text=like.*Pilot*`))?.length ?? 0;
  check("S2 on reconnect it syncs once, stamped RWF", n === before.RW + 2, `${n - before.RW} new RWF sales`);
}

// ── W4 · Liberia unchanged, and the UTC-midnight boundary ─────────────────
{
  await b.reset();
  await b.viewport("360");
  check("LR1 Liberian owner signs in", (await b.signIn("ownerA@e2e.local")) === "/platform", await b.ev(`location.pathname`));
  await b.open("sales");
  const chips = await b.ev(`JSON.stringify([...document.querySelectorAll('main input[name="sale-method"]')].map(i => i.value))`);
  check("LR2 Liberia's till is unchanged (same five methods, same order)", chips === JSON.stringify(["Cash", "Mobile Money", "Credit", "Insurance", "Diaspora Pay"]), chips);
  const s = await b.mainText();
  // Ground truth that holds even with other sales on a shared backend: every
  // USD sale at or after Monrovia midnight, and the boundary sales themselves.
  const sinceMidnight = await ownerA.rest(`purchases?select=amount,items_text&currency_code=eq.USD&purchased_at=gte.${new Date(lrMidnight).toISOString()}`);
  const todayTotal = (sinceMidnight ?? []).reduce((t, r) => t + Number(r.amount), 0);
  const boundary = await ownerA.rest(`purchases?select=amount,items_text,purchased_at&items_text=like.UTC%20midnight*`);
  const after = boundary?.find((r) => r.items_text === "UTC midnight after");
  const beforeSale = boundary?.find((r) => r.items_text === "UTC midnight before");
  const lrSum = (await ownerA.rpc("financial_summary", { p_days: 1 })).body;
  const shown = (s.match(/(\d+) recorded · (US\$[\d,.]+)/) ?? []);
  const expectShown = `US$${todayTotal.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  check("W-MIDNIGHT-4 Liberia: one second after UTC midnight is today (server and UI agree)",
    !!after && new Date(after.purchased_at).getTime() >= lrMidnight && (sinceMidnight ?? []).some((r) => r.items_text === "UTC midnight after")
      && Math.abs(Number(lrSum?.revenue?.today) - todayTotal) < 0.005 && shown[2] === expectShown,
    `server today=${lrSum?.revenue?.today}, UI ${shown[2]}, expected ${expectShown}`);
  check("W-MIDNIGHT-5 Liberia: one second before UTC midnight is yesterday",
    !!beforeSale && new Date(beforeSale.purchased_at).getTime() < lrMidnight && !(sinceMidnight ?? []).some((r) => r.items_text === "UTC midnight before")
      && !/UTC midnight before/.test(s), "the US$111 sale is excluded from today");
  check("LR3 Liberian money is US$, never a bare $", /US\$/.test(s) && !bareDollar.test(s), (s.match(/US\$[\d,.]+/) ?? [""])[0]);
  check("LR4 the server's Liberian summary is USD on Africa/Monrovia", lrSum?.currency === "USD" && lrSum?.timezone === "Africa/Monrovia", `${lrSum?.currency} ${lrSum?.timezone}`);
  check("LR5 no page errors across the pilots", b.exceptions.length === 0, b.exceptions.slice(0, 2).join(" | ") || "none");
}

b.close();
process.exit(done("country pilot checks") ? 1 : 0);
