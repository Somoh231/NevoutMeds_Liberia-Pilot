// NevOut Meds — LOCAL showcase data for visual review (screenshots, before/after matrices).
//
// Fills the synthetic "E2E Pharmacy A" with a believable fortnight of pharmacy
// activity so every screen can be judged with realistic density: ~24 products
// across every stock and expiry state, three suppliers with competing prices,
// customers with credit and allergies, ~45 sales spread over 14 days, refill
// reminders and an open purchase order. Everything goes through the same RPCs
// the app uses, so stock, movements and totals stay consistent.
//
// Synthetic data only: names carry "(demo)" / "Demo" and phone numbers are
// fictional. Refuses anything but the local stack.
//
// Usage (after seed_e2e.sh): node supabase/tests/seed_showcase.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(API)) { console.error("seed_showcase refuses non-local APIs"); process.exit(2); }
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const CONTAINER = process.env.NEVOUT_DB_CONTAINER || "supabase_db_NevOutMeds_Liberia_Pilot";

const token = (await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: "ownerA@e2e.local", password: IDS.password }) })).json()).access_token;
const me = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
const PH = IDS.pharmacyA;
const H = { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
async function rpc(fn, body) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${r.status} ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
}
// One row per request: rows differ in which optional columns they set.
async function insert(table, rows) {
  const out = [];
  for (const row of rows) {
    const r = await fetch(`${API}/rest/v1/${table}`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
    const t = await r.text(); if (!r.ok) throw new Error(`${table}: ${r.status} ${t.slice(0, 200)}`); out.push(...JSON.parse(t));
  }
  return out;
}
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// name, category, unit, cost, price, target stock, reorder, max, velocity, expiry (days from today) or null, prescription
const PRODUCTS = [
  ["Paracetamol 500mg", "Analgesic", "strip of 10", 0.35, 0.75, 140, 40, 300, 9, 420, false],
  ["Amoxicillin 500mg", "Antibiotic", "strip of 10", 1.1, 2.25, 6, 20, 120, 4, 300, true],
  ["Artemether/Lumefantrine 20/120", "Antimalarial", "pack of 24", 2.4, 4.5, 0, 15, 90, 5, 260, true],
  ["ORS Sachet", "Rehydration", "sachet", 0.12, 0.3, 210, 60, 400, 12, 540, false],
  ["Ibuprofen 400mg", "Analgesic", "strip of 10", 0.5, 1.0, 18, 25, 150, 5, 5, false],
  ["Metformin 500mg", "Diabetes", "strip of 10", 0.8, 1.6, 64, 20, 120, 3, 380, true],
  ["Amlodipine 5mg", "Cardiovascular", "strip of 10", 0.9, 1.8, 9, 15, 100, 2, 200, true],
  ["Zinc Sulfate 20mg", "Supplement", "strip of 10", 0.3, 0.7, 88, 20, 150, 3, 25, false],
  ["Ferrous Sulfate 200mg", "Supplement", "tub of 100", 1.5, 3.0, 22, 10, 60, 1, 610, false],
  ["Cotrimoxazole 480mg", "Antibiotic", "strip of 10", 0.6, 1.3, 3, 15, 90, 3, 150, true],
  ["Salbutamol Inhaler", "Respiratory", "inhaler", 2.2, 4.0, 11, 6, 30, 1, 480, true],
  ["Omeprazole 20mg", "Gastrointestinal", "strip of 14", 0.7, 1.5, 36, 12, 80, 2, 70, false],
  ["Cetirizine 10mg", "Antihistamine", "strip of 10", 0.25, 0.6, 250, 20, 120, 2, 330, false],
  ["Vitamin C 500mg", "Supplement", "tub of 100", 1.2, 2.5, 14, 8, 50, 1, -4, false],
  ["Doxycycline 100mg", "Antibiotic", "strip of 10", 0.9, 1.9, 27, 10, 70, 2, 48, true],
  ["Hydrocortisone Cream 1%", "Dermatology", "tube 15g", 1.0, 2.2, 19, 6, 40, 1, 82, false],
  ["Losartan 50mg", "Cardiovascular", "strip of 10", 1.1, 2.3, 42, 12, 80, 2, 410, true],
  ["Folic Acid 5mg", "Supplement", "strip of 10", 0.2, 0.5, 75, 15, 100, 2, 12, false],
  ["Mebendazole 100mg", "Anthelmintic", "strip of 6", 0.4, 0.9, 58, 10, 80, 2, 360, false],
  ["Ceftriaxone 1g Injection", "Antibiotic", "vial", 1.8, 3.6, 12, 5, 40, 1, 190, true],
  ["Diclofenac Gel", "Analgesic", "tube 30g", 1.3, 2.6, 16, 5, 30, 1, 3, false],
  ["Prenatal Multivitamin", "Supplement", "strip of 30", 2.0, 4.2, 20, 8, 40, 1, 520, false],
  ["Glibenclamide 5mg", "Diabetes", "strip of 10", 0.5, 1.1, 4, 10, 60, 1, 240, true],
  ["Magnesium Trisilicate Suspension", "Gastrointestinal", "bottle 200ml", 0.9, 1.9, 23, 6, 40, 1, 35, false]
];

// ── Products ──────────────────────────────────────────────────────────────────
const byName = {};
for (const [name, category, unit, cost, price, target, reorder, max, velocity, exp, rx] of PRODUCTS) {
  const id = await rpc("create_product", {
    p_pharmacy_id: PH, p_name: name, p_category: category, p_unit_cost: cost, p_selling_price: price,
    p_stock: target + 40, p_brand: null, p_unit: unit, p_reorder_point: reorder, p_max_stock: max,
    p_daily_velocity: velocity, p_batch_id: `B-${Math.floor(1000 + rand() * 8999)}`,
    p_expiry_date: exp === null ? null : day(exp), p_is_essential: true, p_requires_prescription: rx
  });
  byName[name] = { id, name, price, target, stock: target + 40 };
}

// ── Suppliers and competing prices ───────────────────────────────────────────
const suppliers = await insert("suppliers", [
  { pharmacy_id: PH, name: "Monrovia Medical Supply (demo)", country: "LR", city: "Monrovia", whatsapp: "+231770000101", phone: "+231770000101", lead_days: 2, payment_terms: "Cash on delivery", min_order: 50 },
  { pharmacy_id: PH, name: "Gbarnga Pharma Wholesale (demo)", country: "LR", city: "Gbarnga", whatsapp: "+231880000202", lead_days: 5, payment_terms: "Net 14", min_order: 100 },
  { pharmacy_id: PH, name: "Coastline Distributors (demo)", country: "LR", city: "Buchanan", phone: "+231770000303", lead_days: 3, payment_terms: "Net 7", min_order: 75 }
]);
const [S1, S2, S3] = suppliers.map((s) => s.id);
const cat = [];
const offer = (sup, name, unitCost, extra = {}) => cat.push({ pharmacy_id: PH, supplier_id: sup, product_name: name, unit_cost: unitCost, unit: PRODUCTS.find((p) => p[0] === name)[2], currency: "USD", is_active: true, stock_status: "in_stock", ...extra });
for (const [name, , , cost] of PRODUCTS.slice(0, 14)) {
  offer(S1, name, +(cost * 1.04).toFixed(2));
  offer(S2, name, +(cost * 0.9).toFixed(2), name === "Amoxicillin 500mg" ? { stock_status: "out_of_stock" } : {});
  if (rand() > 0.35) offer(S3, name, +(cost * 0.97).toFixed(2), { moq: 20 });
}
await insert("supplier_catalogue", cat);

// ── Customers ────────────────────────────────────────────────────────────────
const people = [
  ["Walk-in", "Customer", "+231770009999", 0, null],
  ["Musu", "Demo", "+231770001001", 60, null], ["Kollie", "Demo", "+231770001002", 0, "Penicillin"],
  ["Fatu", "Demo", "+231880001003", 40, null], ["Jallah", "Demo", "+231770001004", 25, "Sulfa drugs"],
  ["Comfort", "Demo", "+231880001005", 0, null], ["Sekou", "Demo", "+231770001006", 30, null],
  ["Bendu", "Demo", "+231880001007", 0, null], ["Varney", "Demo", "+231770001008", 15, null], ["Hawa", "Demo", "+231880001009", 0, null]
];
const customers = await insert("customers", people.map(([first, last, phone, limit, allergy]) => ({
  pharmacy_id: PH, first_name: first, last_name: last, phone, credit_limit: limit, community: ["Sinkor", "Paynesville", "Congo Town", "Duala", "Bushrod Island"][Math.floor(rand() * 5)], county: "Montserrado", allergies: allergy ? [allergy] : []
})));

// ── A fortnight of sales ─────────────────────────────────────────────────────
const sellable = PRODUCTS.filter((p) => p[5] > 0).map((p) => byName[p[0]]);
const saleIds = [];
for (let i = 0; i < 46; i++) {
  const cust = i % 3 === 0 ? customers[0] : customers[1 + Math.floor(rand() * (customers.length - 1))];
  const lines = []; const n = 1 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const p = sellable[Math.floor(rand() * sellable.length)];
    if (lines.some((l) => l.product_id === p.id) || p.stock <= 2) continue;
    const qty = 1 + Math.floor(rand() * 3); p.stock -= qty;
    lines.push({ product_id: p.id, name: p.name, qty, unit_price: p.price });
  }
  if (!lines.length) continue;
  const method = cust === customers[0] ? (rand() > 0.3 ? "Cash" : "Mobile Money") : ["Cash", "Mobile Money", "Credit", "Cash"][Math.floor(rand() * 4)];
  const id = await rpc("record_purchase", { p_pharmacy_id: PH, p_customer_id: cust.id, p_method: method, p_staff_id: me, p_items: lines });
  saleIds.push(id);
}
// Spread the sales over the last 14 days (local stack only), newest last.
const values = saleIds.map((id, i) => `('${id}'::uuid, ${Math.max(0, 13 - Math.floor((i / saleIds.length) * 14))})`).join(",");
execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-qc",
  `update public.purchases p set purchased_at = now() - make_interval(days => v.d, hours => (extract(epoch from p.created_at)::int % 7)) from (values ${values}) v(id, d) where p.id = v.id`]);

// ── Bring stock to the intended picture (every stock state is represented) ──
for (const p of Object.values(byName)) {
  const delta = p.target - p.stock;
  if (delta) await rpc("adjust_stock", { p_pharmacy_id: PH, p_product_id: p.id, p_delta: delta, p_note: "Stock count correction" });
}

// ── Refill reminders and an open order ───────────────────────────────────────
await insert("reminders", [
  { pharmacy_id: PH, customer_id: customers[4].id, medicine: "Metformin 500mg", due_date: day(-2), sent: false },
  { pharmacy_id: PH, customer_id: customers[1].id, medicine: "Amlodipine 5mg", due_date: day(0), sent: false },
  { pharmacy_id: PH, customer_id: customers[6].id, medicine: "Losartan 50mg", due_date: day(0), sent: false },
  { pharmacy_id: PH, customer_id: customers[3].id, medicine: "Prenatal Multivitamin", due_date: day(4), sent: false },
  { pharmacy_id: PH, customer_id: customers[8].id, medicine: "Salbutamol Inhaler", due_date: day(9), sent: false }
]);
await rpc("create_purchase_order", {
  p_pharmacy_id: PH, p_supplier_id: S2,
  p_items: [{ product_id: byName["Artemether/Lumefantrine 20/120"].id, name: "Artemether/Lumefantrine 20/120", qty: 40, unit_price: 2.16 }, { product_id: byName["Cotrimoxazole 480mg"].id, name: "Cotrimoxazole 480mg", qty: 30, unit_price: 0.54 }],
  p_whatsapp_message: "Order from E2E Pharmacy A (demo)", p_currency: "USD"
});

console.log(`showcase: ${PRODUCTS.length} products, ${suppliers.length} suppliers, ${cat.length} prices, ${customers.length} customers, ${saleIds.length} sales, 5 reminders, 1 order`);
