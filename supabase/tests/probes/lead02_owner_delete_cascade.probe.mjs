// NevOut Meds — NV-LEAD-02 validation probe (LOCAL stack only; see SECURITY_FINDINGS_REGISTER.md).
//
// An aal2 owner deletes, through plain PostgREST, a customer with a credit sale and a
// product with stock movements; the probe records what the FK cascades remove and
// whether any audit row is written. Staff and aal1 owners are tried first (0 rows).
// Creates its own synthetic product/customer in the e2e pharmacy A; re-seed afterwards
// with supabase/tests/seed_e2e.sh. Prints no secrets or tokens.
//
// Since migration 0024 the owner's deletes are refused (HTTP 403) and nothing changes;
// the pass/fail regression is supabase/tests/api_delete_guard.e2e.mjs.
//
// Usage: node supabase/tests/probes/lead02_owner_delete_cascade.probe.mjs   (after seed_e2e.sh)
import fs from "node:fs"; import { execFileSync } from "node:child_process";
import { readIds, signInFull, passwordSession, claims } from "../lib/mfa.mjs";
const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API)) { console.error("refusing to run against a non-local API"); process.exit(2); }
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim(); const IDS = readIds();
const sql = (q) => execFileSync("docker", ["exec", process.env.NEVOUT_DB_CONTAINER || "supabase_db_NevOutMeds_Liberia_Pilot", "psql", "-U", "postgres", "-d", "postgres", "-XAtc", q]).toString().trim();
const req = async (tok, p, init = {}) => { const r = await fetch(`${API}/rest/v1/${p}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, body: j ?? t }; };
const ph = IDS.pharmacyA;
const owner = await signInFull(API, ANON, "ownerA@e2e.local", IDS.password);
console.log("owner session aal:", claims(owner.access_token).aal);
const staff = await signInFull(API, ANON, "staffA@e2e.local", IDS.password);

// Fixture: a customer with a credit sale, a product with stock movements
const prod = (await req(owner.access_token, "rpc/create_product", { method: "POST", body: JSON.stringify({ p_pharmacy_id: ph, p_name: `Lead02 Probe ${Date.now()}`, p_category: "Probe", p_unit_cost: 1, p_selling_price: 4, p_stock: 10 }) })).body;
const cust = (await req(owner.access_token, "customers", { method: "POST", body: JSON.stringify({ pharmacy_id: ph, phone: "+231777009" + String(Date.now()).slice(-3), first_name: "Lead02", last_name: "Probe" }) })).body[0].id;
const sale = await req(staff.access_token, "rpc/record_purchase_idempotent", { method: "POST", body: JSON.stringify({ p_pharmacy_id: ph, p_customer_id: cust, p_method: "Credit", p_staff_id: IDS.staffA, p_items: [{ product_id: prod, name: "Lead02 Probe", qty: 3, unit_price: 4 }], p_idempotency_key: `lead02-${Date.now()}`, p_currency: null }) });
console.log("fixture: product, customer, credit sale ->", typeof prod === "string" ? "ok" : prod, cust ? "ok" : "no", sale.status);
const counts = () => JSON.parse(sql(`select json_build_object(
  'purchases_for_customer', (select count(*) from public.purchases where customer_id = '${cust}'),
  'sale_items_for_product', (select count(*) from public.purchase_items where product_id = '${prod}'),
  'sale_items_orphaned_to_null', (select count(*) from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id where p.pharmacy_id = '${ph}' and pi.product_id is null),
  'pharmacy_sales_total', (select coalesce(sum(amount), 0) from public.purchases where pharmacy_id = '${ph}'),
  'stock_movements_for_product', (select count(*) from public.stock_movements where product_id = '${prod}'),
  'inventory_for_product', (select count(*) from public.inventory where product_id = '${prod}'),
  'staff_audit_log', (select count(*) from public.staff_audit_log where pharmacy_id = '${ph}'),
  'security_events', (select count(*) from public.security_events where pharmacy_id = '${ph}'))`));
const before = counts(); console.log("before:", JSON.stringify(before));

console.log("staff DELETE customer ->", (await req(staff.access_token, `customers?id=eq.${cust}`, { method: "DELETE" })).body.length ?? "?", "row(s)");
const aal1 = await passwordSession(API, ANON, "ownerA@e2e.local", IDS.password);
console.log("owner at aal1 DELETE customer ->", (await req(aal1.access_token, `customers?id=eq.${cust}`, { method: "DELETE" })).body.length ?? "?", "row(s)");
const dc = await req(owner.access_token, `customers?id=eq.${cust}`, { method: "DELETE" });
console.log("owner aal2 DELETE customer -> HTTP", dc.status, Array.isArray(dc.body) ? `${dc.body.length} row(s)` : JSON.stringify(dc.body).slice(0, 160));
const dp = await req(owner.access_token, `products?id=eq.${prod}`, { method: "DELETE" });
console.log("owner aal2 DELETE product -> HTTP", dp.status, Array.isArray(dp.body) ? `${dp.body.length} row(s)` : JSON.stringify(dp.body).slice(0, 160));
const after = counts(); console.log("after: ", JSON.stringify(after));
const changed = Object.keys(before).filter((k) => before[k] !== after[k]).map((k) => `${k} ${before[k]} -> ${after[k]}`);
console.log("changed:", changed.join("; "));
