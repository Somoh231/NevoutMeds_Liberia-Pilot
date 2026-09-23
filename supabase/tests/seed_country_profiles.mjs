// NevOut Meds — Phase 9, Part U: synthetic seed profiles for every supported
// country (LR, SL, GH, NG, GM, KE, RW) on the LOCAL stack.
//
// One demo pharmacy per country with an owner, a few products priced in the
// local currency, a customer with a local phone number and a supplier. Only
// the country code is set on the pharmacy: currency, timezone, locale and
// payment methods come from the server registry, exactly as onboarding does.
//
// Synthetic data only. Refuses to run against anything but localhost.
// Usage: NEVOUT_API_URL=http://127.0.0.1:55421 node supabase/tests/seed_country_profiles.mjs
import fs from "node:fs";

const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
if (!/127\.0\.0\.1|localhost/.test(API)) {
  console.error("seed_country_profiles only seeds the LOCAL stack.");
  process.exit(2);
}
const SERVICE = fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim();
const PASSWORD = process.env.NEVOUT_TEST_PASSWORD || "PilotTest123!";
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const rest = (p, body) => fetch(`${API}/rest/v1/${p}`, { method: "POST", headers: { ...H, Prefer: "return=representation,resolution=merge-duplicates" }, body: JSON.stringify(body) })
  .then(async (r) => { const t = await r.text(); if (!r.ok) throw new Error(`${p}: ${r.status} ${t.slice(0, 200)}`); return JSON.parse(t); });

async function ensureUser(email) {
  const r = await fetch(`${API}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) });
  if (r.ok) return (await r.json()).id;
  const list = await (await fetch(`${API}/auth/v1/admin/users?per_page=1000`, { headers: H })).json();
  return (list.users ?? list).find((u) => u.email === email).id;
}

// Prices are illustrative, in each country's currency — not market data.
const PROFILES = [
  { code: "LR", n: 1, city: "Buchanan", phone: "+231770000101", price: [0.5, 1.0], customer: ["Musu", "Kollie"], supplier: "Synthetic Wholesale LR" },
  { code: "SL", n: 2, city: "Bo", phone: "+23276000101", price: [8, 15], customer: ["Fatmata", "Kamara"], supplier: "Synthetic Wholesale SL" },
  { code: "GH", n: 3, city: "Kumasi", phone: "+233240000101", price: [2, 5], customer: ["Akosua", "Owusu"], supplier: "Synthetic Wholesale GH" },
  { code: "NG", n: 4, city: "Ibadan", phone: "+2348030000101", price: [300, 650], customer: ["Ngozi", "Okafor"], supplier: "Synthetic Wholesale NG" },
  { code: "GM", n: 5, city: "Serekunda", phone: "+2203000101", price: [20, 45], customer: ["Isatou", "Jallow"], supplier: "Synthetic Wholesale GM" },
  { code: "KE", n: 6, city: "Kisumu", phone: "+254712000101", price: [20, 35], customer: ["Achieng", "Otieno"], supplier: "Synthetic Wholesale KE" },
  { code: "RW", n: 7, city: "Huye", phone: "+250788000101", price: [150, 300], customer: ["Aline", "Uwimana"], supplier: "Synthetic Wholesale RW" }
];

const out = {};
for (const p of PROFILES) {
  const id = `dddddddd-0000-0000-0000-00000000000${p.n}`;
  const email = `owner-${p.code.toLowerCase()}@country.local`;
  const owner = await ensureUser(email);
  const [ph] = await rest("pharmacies?on_conflict=id", { id, name: `Demo Pharmacy ${p.code}`, country_code: p.code, city: p.city, phone: p.phone });
  await rest("users_profiles?on_conflict=id", { id: owner, pharmacy_id: id, role: "owner", name: `Owner ${p.code}`, email });
  const [prod] = await rest("products", { pharmacy_id: id, name: "Demo Paracetamol 500mg", category: "Analgesic", unit: "tablets", unit_cost: p.price[0], selling_price: p.price[1], reorder_point: 20, max_stock: 200, daily_velocity: 3 });
  await rest("inventory", { pharmacy_id: id, product_id: prod.id, stock: 120 });
  await rest("customers", { pharmacy_id: id, first_name: p.customer[0], last_name: p.customer[1], phone: p.phone.replace(/01$/, "02") });
  const [sup] = await rest("suppliers", { pharmacy_id: id, name: p.supplier, lead_days: 3 });
  await rest("supplier_catalogue", { pharmacy_id: id, supplier_id: sup.id, product_name: "Demo Paracetamol 500mg", unit_cost: p.price[0] * 0.9, unit: "tablets" });
  out[p.code] = { pharmacy: id, email, currency: ph.default_currency, timezone: ph.timezone, locale: ph.locale, payment_methods: ph.payment_methods };
  console.log(`${p.code}  ${ph.default_currency}  ${ph.timezone.padEnd(16)} ${ph.locale}  ${email}`);
}
fs.writeFileSync("/tmp/nevout_country_profiles.json", JSON.stringify(out, null, 2));
console.log(`\nSeeded ${PROFILES.length} synthetic country profiles (password: the local test password).`);
