// NevOut Meds — NV-LEAD-02 regression through the real API (LOCAL stack only).
//
// Since 0024 no pharmacy user can DELETE a customer or a product through PostgREST,
// so sales and stock history can no longer be cascaded away without an audit row.
// Day-to-day writes keep working. Creates its own synthetic rows in e2e pharmacy A.
// Prints no secrets or tokens.
//
// Usage: node supabase/tests/api_delete_guard.e2e.mjs   (after seed_e2e.sh)
import fs from "node:fs";
import { claims, passwordSession, readIds, signInFull } from "./lib/mfa.mjs";

const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API)) { console.error("refusing to run against a non-local API"); process.exit(2); }
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const SERVICE = fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim();
const IDS = readIds();
const PH = IDS.pharmacyA;

let pass = 0, fail = 0;
const check = (d, ok, detail = "") => { if (ok) { pass++; console.log(`ok   ${d}${detail ? ` [${detail}]` : ""}`); } else { fail++; console.log(`NOT OK ${d} [${detail}]`); } };
const req = async (tok, p, init = {}, key = ANON) => {
  const r = await fetch(`${API}/rest/v1/${p}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) } });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
  return { status: r.status, body: j ?? t };
};
const rows = (r) => (Array.isArray(r.body) ? r.body.length : -1);
const del = (tok, p, key) => req(tok, p, { method: "DELETE" }, key);

const owner = await signInFull(API, ANON, "ownerA@e2e.local", IDS.password);
const ownerAal1 = await passwordSession(API, ANON, "ownerA@e2e.local", IDS.password);
const staff = await signInFull(API, ANON, "staffA@e2e.local", IDS.password);
const ownerB = await signInFull(API, ANON, "ownerB@e2e.local", IDS.password);
check("setup: owner session is aal2", claims(owner.access_token).aal === "aal2");

// A customer with a credit sale and a product with stock movements
const prod = (await req(owner.access_token, "rpc/create_product", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH, p_name: `Guard Probe ${Date.now()}`, p_category: "Probe", p_unit_cost: 1, p_selling_price: 4, p_stock: 10 }) })).body;
const custRes = await req(owner.access_token, "customers", { method: "POST", body: JSON.stringify({ pharmacy_id: PH, phone: "+23177701" + String(Date.now()).slice(-4), first_name: "Guard", last_name: "Probe" }) });
const cust = custRes.body?.[0]?.id;
const sale = await req(staff.access_token, "rpc/record_purchase_idempotent", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH, p_customer_id: cust, p_method: "Credit", p_staff_id: IDS.staffA, p_items: [{ product_id: prod, name: "Guard Probe", qty: 2, unit_price: 4 }], p_idempotency_key: crypto.randomUUID(), p_currency: null }) });
check("setup: product, customer and a credit sale exist", typeof prod === "string" && !!cust && sale.status === 200, `${sale.status}`);
const history = async () => {
  const [p, m, inv] = await Promise.all([
    req(owner.access_token, `purchases?select=id&customer_id=eq.${cust}`),
    req(owner.access_token, `stock_movements?select=id&product_id=eq.${prod}`),
    req(owner.access_token, `inventory?select=stock&product_id=eq.${prod}`)
  ]);
  return { purchases: rows(p), movements: rows(m), inventory: rows(inv) };
};
const before = await history();

// Direct API deletes
let r = await del(owner.access_token, `customers?id=eq.${cust}`);
check("MFA-complete owner: DELETE customer is refused", r.status === 401 || r.status === 403, `HTTP ${r.status} ${r.body?.code ?? ""}`);
r = await del(owner.access_token, `products?id=eq.${prod}`);
check("MFA-complete owner: DELETE product is refused", r.status === 401 || r.status === 403, `HTTP ${r.status} ${r.body?.code ?? ""}`);
r = await del(owner.access_token, `customers?pharmacy_id=eq.${PH}`);
check("MFA-complete owner: bulk DELETE of customers is refused", r.status === 401 || r.status === 403, `HTTP ${r.status}`);
for (const [who, tok] of [["owner at aal1", ownerAal1.access_token], ["staff", staff.access_token], ["another pharmacy's owner", ownerB.access_token]]) {
  const a = await del(tok, `customers?id=eq.${cust}`); const b = await del(tok, `products?id=eq.${prod}`);
  check(`${who}: DELETE customer and product delete nothing`, ![a, b].some((x) => x.status < 300 && rows(x) > 0), `HTTP ${a.status}/${b.status}`);
}
const anonDel = await del(ANON, `customers?id=eq.${cust}`);
check("anonymous: DELETE customer deletes nothing", !(anonDel.status < 300 && rows(anonDel) > 0), `HTTP ${anonDel.status}`);

const after = await history();
check("the customer's sales, the product's movements and inventory are intact", JSON.stringify(before) === JSON.stringify(after) && before.purchases === 1 && before.movements >= 2 && before.inventory === 1, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
check("the customer and product still exist", rows(await req(owner.access_token, `customers?select=id&id=eq.${cust}`)) === 1 && rows(await req(owner.access_token, `products?select=id&id=eq.${prod}`)) === 1);

// Day-to-day writes still work through the API
r = await req(owner.access_token, `customers?id=eq.${cust}`, { method: "PATCH", body: JSON.stringify({ community: "Sinkor" }) });
check("owner can still edit the customer", r.status === 200 && rows(r) === 1, `HTTP ${r.status}`);
r = await req(owner.access_token, `products?on_conflict=pharmacy_id,name`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify([{ pharmacy_id: PH, name: `Guard Import ${Date.now()}`, category: "Probe", unit_cost: 1, selling_price: 2 }]) });
check("product import upsert still works", r.status === 201 || r.status === 200, `HTTP ${r.status}`);
r = await req(staff.access_token, "rpc/adjust_stock", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH, p_product_id: prod, p_delta: 1, p_note: "restock" }) });
check("staff can still adjust stock", r.status === 200, `HTTP ${r.status}`);

// Operator maintenance through the service role keeps DELETE (test clean-up)
const s1 = await del(SERVICE, `purchases?customer_id=eq.${cust}`, SERVICE);
const s2 = await del(SERVICE, `customers?id=eq.${cust}`, SERVICE);
const s3 = await del(SERVICE, `products?id=eq.${prod}`, SERVICE);
check("service role can still delete (operator maintenance and this test's clean-up)", [s1, s2, s3].every((x) => x.status === 200) && rows(s2) === 1 && rows(s3) === 1, `${s1.status}/${s2.status}/${s3.status}`);
await del(SERVICE, `products?name=like.Guard%20Import*&pharmacy_id=eq.${PH}`, SERVICE);

console.log(`\n# ${pass + fail} delete-guard API checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
