// End-to-end tenant-isolation tests through PostgREST (the path the app uses).
// Sessions come from real GoTrue logins; nothing here is hand-minted except the
// anon API key, which is public by design.
//
// Prerequisites: supabase/tests/seed_e2e.sh
import fs from "node:fs";

const BASE = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));

async function login(email) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: IDS.password })
  });
  const body = await r.json();
  if (!body.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(body).slice(0, 120)}`);
  return body.access_token;
}

const A_OWNER = await login("ownerA@e2e.local");
const A_STAFF = await login("staffA@e2e.local");
const B_OWNER = await login("ownerB@e2e.local");
const PH_A = IDS.pharmacyA, PH_B = IDS.pharmacyB;
const CUST_B = "cccccccc-0000-0000-0000-00000000000b";
const PROD_A = "dddddddd-0000-0000-0000-00000000000a";
const PROD_B = "dddddddd-0000-0000-0000-00000000000b";

let pass = 0, fail = 0;
async function call(token, path, init = {}) {
  const r = await fetch(BASE + path, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
}
function check(desc, ok, detail) {
  if (ok) { pass++; console.log(`ok   ${desc}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`NOT OK ${desc} [${detail}]`); }
}

// 1. anon is refused everywhere
let r = await call(ANON, "/rest/v1/customers?select=id");
check("anon cannot read customers", r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `${r.status} ${JSON.stringify(r.body).slice(0,90)}`);
r = await call(ANON, "/rest/v1/rpc/record_purchase", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_customer_id: CUST_B, p_method: "Cash", p_staff_id: null, p_items: [{ name: "x", qty: 1, unit_price: 1 }] }) });
check("anon cannot call record_purchase", r.status >= 400, `${r.status} ${r.body?.message || ""}`);

// 2. tenant isolation on reads
r = await call(A_OWNER, "/rest/v1/customers?select=id,pharmacy_id");
check("owner A reads only pharmacy A customers", r.status === 200 && r.body.every((c) => c.pharmacy_id === PH_A), `${r.status} n=${r.body?.length}`);
r = await call(B_OWNER, "/rest/v1/customers?select=id,pharmacy_id");
check("owner B reads only pharmacy B customers", r.status === 200 && r.body.every((c) => c.pharmacy_id === PH_B), `${r.status} n=${r.body?.length}`);
r = await call(A_OWNER, `/rest/v1/customers?id=eq.${CUST_B}&select=id`);
check("owner A cannot fetch pharmacy B customer by id", r.status === 200 && r.body.length === 0, `${r.status} n=${r.body?.length}`);

// 3. cross-tenant writes
r = await call(A_OWNER, `/rest/v1/customers?id=eq.${CUST_B}`, { method: "PATCH", body: JSON.stringify({ notes: "pwned" }), headers: { Prefer: "return=representation" } });
check("owner A cannot update pharmacy B customer", r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `${r.status} n=${r.body?.length ?? "-"}`);
r = await call(A_OWNER, "/rest/v1/customers", { method: "POST", body: JSON.stringify({ pharmacy_id: PH_B, phone: "+2319999", first_name: "X", last_name: "Y" }) });
check("owner A cannot insert into pharmacy B", r.status >= 400, `${r.status} ${r.body?.message || ""}`);

// 4. privilege escalation
r = await call(A_STAFF, `/rest/v1/users_profiles?id=eq.${IDS.staffA}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) });
check("staff cannot promote self to admin via API", r.status >= 400, `${r.status} ${r.body?.message || ""}`);
r = await call(A_STAFF, `/rest/v1/users_profiles?id=eq.${IDS.staffA}`, { method: "PATCH", body: JSON.stringify({ pharmacy_id: PH_B }) });
check("staff cannot change own pharmacy via API", r.status >= 400, `${r.status} ${r.body?.message || ""}`);
r = await call(A_OWNER, "/rest/v1/users_profiles", { method: "POST", body: JSON.stringify({ id: "44444444-4444-4444-4444-444444444444", pharmacy_id: PH_A, role: "admin", name: "Bad" }) });
check("owner cannot create an admin via API", r.status >= 400, `${r.status} ${r.body?.message || ""}`);

// 5. RPC hardening over HTTP
r = await call(A_STAFF, "/rest/v1/rpc/record_purchase", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_customer_id: CUST_B, p_method: "Cash", p_staff_id: null, p_items: [{ name: "x", qty: 1, unit_price: 1 }] }) });
check("record_purchase rejects foreign-tenant customer", r.status >= 400, `${r.status} ${r.body?.message || ""}`);
r = await call(A_STAFF, "/rest/v1/rpc/record_purchase", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_customer_id: "cccccccc-0000-0000-0000-00000000000a", p_method: "Cash", p_staff_id: null, p_items: [{ product_id: PROD_B, name: "x", qty: 1, unit_price: 1 }] }) });
check("record_purchase rejects foreign-tenant product", r.status >= 400, `${r.status} ${r.body?.message || ""}`);
r = await call(A_STAFF, "/rest/v1/rpc/adjust_stock", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_product_id: PROD_A, p_delta: -999 }) });
check("adjust_stock rejects impossible mutation", r.status >= 400, `${r.status} ${r.body?.message || ""}`);

// 6. the legitimate workflow still works over HTTP (re-runnable: relative check)
const before = (await call(A_STAFF, `/rest/v1/inventory?product_id=eq.${PROD_A}&select=stock`)).body?.[0]?.stock;
r = await call(A_STAFF, "/rest/v1/rpc/record_purchase", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_customer_id: "cccccccc-0000-0000-0000-00000000000a", p_method: "Cash", p_staff_id: IDS.staffA, p_items: [{ product_id: PROD_A, name: "Para A", qty: 3, unit_price: 1.5 }] }) });
check("staff A records a real purchase over HTTP", r.status === 200 && typeof r.body === "string", `${r.status} ${JSON.stringify(r.body).slice(0,60)}`);
r = await call(A_STAFF, `/rest/v1/inventory?product_id=eq.${PROD_A}&select=stock`);
check("stock decremented by exactly the quantity sold (3)", r.body?.[0]?.stock === before - 3, `${before} -> ${r.body?.[0]?.stock}`);
r = await call(B_OWNER, `/rest/v1/inventory?product_id=eq.${PROD_B}&select=stock`);
check("pharmacy B stock untouched", r.body?.[0]?.stock === 30, `stock=${r.body?.[0]?.stock}`);


// 7. Phase 3 — data correctness over HTTP
const phone = `+2315${Date.now().toString().slice(-6)}`;
r = await call(A_STAFF, "/rest/v1/customers", { method: "POST", body: JSON.stringify({ pharmacy_id: PH_A, phone, first_name: "Persisted", last_name: "Customer" }), headers: { Prefer: "return=representation" } });
check("customer creation persists over HTTP", r.status === 201 && r.body?.[0]?.phone === phone, `${r.status}`);
r = await call(A_OWNER, `/rest/v1/customers?phone=eq.${encodeURIComponent(phone)}&select=id,first_name`);
check("same-pharmacy owner sees the customer staff just created", r.status === 200 && r.body.length === 1, `n=${r.body?.length}`);
r = await call(B_OWNER, `/rest/v1/customers?phone=eq.${encodeURIComponent(phone)}&select=id`);
check("other pharmacy cannot see that customer", r.status === 200 && r.body.length === 0, `n=${r.body?.length}`);

// duplicate phone must fail, not silently succeed
r = await call(A_STAFF, "/rest/v1/customers", { method: "POST", body: JSON.stringify({ pharmacy_id: PH_A, phone, first_name: "Dup", last_name: "Customer" }) });
check("duplicate customer phone is rejected", r.status >= 400, `${r.status} ${r.body?.code || ""}`);

// atomic product creation
const pname = `RPC Product ${Date.now()}`;
r = await call(A_OWNER, "/rest/v1/rpc/create_product", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_name: pname, p_category: "Test", p_unit_cost: 1, p_selling_price: 2, p_stock: 7 }) });
const newProductId = r.body;
check("create_product returns a product id", r.status === 200 && typeof newProductId === "string", `${r.status}`);
r = await call(A_OWNER, `/rest/v1/inventory?product_id=eq.${newProductId}&select=stock`);
check("create_product created inventory atomically", r.body?.[0]?.stock === 7, `stock=${r.body?.[0]?.stock}`);
r = await call(A_OWNER, "/rest/v1/rpc/create_product", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_name: `Bad ${Date.now()}`, p_category: "Test", p_unit_cost: 1, p_selling_price: 2, p_stock: -3 }) });
check("create_product rejects negative opening stock", r.status >= 400, `${r.status}`);

// atomic purchase order (supplier belongs to A)
const supA = (await call(A_OWNER, "/rest/v1/suppliers?select=id&limit=1")).body?.[0]?.id
  || (await call(A_OWNER, "/rest/v1/suppliers", { method: "POST", body: JSON.stringify({ pharmacy_id: PH_A, name: "E2E Supplier A" }), headers: { Prefer: "return=representation" } })).body?.[0]?.id;
r = await call(A_OWNER, "/rest/v1/rpc/create_purchase_order", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_supplier_id: supA, p_items: [{ product_id: PROD_A, name: "Para A", qty: 4, unit_price: 0.5 }, { name: "Gloves", qty: 2, unit_price: 3 }] }) });
const poId = r.body;
check("create_purchase_order succeeds over HTTP", r.status === 200 && typeof poId === "string", `${r.status} ${r.body?.message || ""}`);
r = await call(A_OWNER, `/rest/v1/purchase_orders?id=eq.${poId}&select=total`);
check("purchase order total computed server-side (4*0.5 + 2*3 = 8)", Number(r.body?.[0]?.total) === 8, `total=${r.body?.[0]?.total}`);
r = await call(A_OWNER, `/rest/v1/purchase_order_items?purchase_order_id=eq.${poId}&select=id`);
check("purchase order wrote both lines atomically", r.body?.length === 2, `n=${r.body?.length}`);
const poCountBefore = (await call(A_OWNER, "/rest/v1/purchase_orders?select=id")).body?.length;
r = await call(A_OWNER, "/rest/v1/rpc/create_purchase_order", { method: "POST", body: JSON.stringify({ p_pharmacy_id: PH_A, p_supplier_id: supA, p_items: [{ name: "Bad", qty: 0, unit_price: 1 }] }) });
const poCountAfter = (await call(A_OWNER, "/rest/v1/purchase_orders?select=id")).body?.length;
check("failed purchase order leaves no partial row", r.status >= 400 && poCountBefore === poCountAfter, `${r.status} ${poCountBefore}->${poCountAfter}`);

// owner-only analytics
r = await call(A_OWNER, "/rest/v1/rpc/financial_summary", { method: "POST", body: JSON.stringify({ p_days: 30 }) });
check("financial_summary returns real revenue for the owner", r.status === 200 && Number(r.body?.revenue?.total) > 0, `${r.status} total=${r.body?.revenue?.total}`);
check("financial_summary declares untracked figures", Array.isArray(r.body?.not_tracked) && r.body.not_tracked.length === 4, `${JSON.stringify(r.body?.not_tracked)}`);
r = await call(A_STAFF, "/rest/v1/rpc/financial_summary", { method: "POST", body: JSON.stringify({ p_days: 30 }) });
check("staff cannot read financial_summary", r.status >= 400, `${r.status}`);
r = await call(B_OWNER, "/rest/v1/rpc/financial_summary", { method: "POST", body: JSON.stringify({ p_days: 30 }) });
check("pharmacy B financials exclude pharmacy A revenue", Number(r.body?.revenue?.total) === 0, `total=${r.body?.revenue?.total}`);
r = await call(A_OWNER, "/rest/v1/rpc/staff_performance", { method: "POST", body: JSON.stringify({ p_days: 7 }) });
const roster = await call(A_OWNER, "/rest/v1/users_profiles?select=id");
check("staff_performance returns exactly this pharmacy's members",
  r.status === 200 && r.body.length === (roster.body ?? []).length && r.body.length > 0,
  `${r.status} perf=${r.body?.length} roster=${roster.body?.length}`);


// 8. Document storage is bucket- and tenant-scoped
// Use an allowed mime type, so any rejection is an RLS decision rather than
// the bucket's mime filter.
const upload = async (token, path, body = "%PDF-1.4 test") => {
  const r = await fetch(`${BASE}/storage/v1/object/documents/${path}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/pdf" },
    body
  });
  let j; try { j = await r.json(); } catch { j = null; }
  return { status: r.status, body: j };
};
r = await upload(A_OWNER, `${PH_A}/owner-${Date.now()}.pdf`);
check("owner can upload a document under their own pharmacy prefix", r.status === 200, `${r.status} ${r.body?.message || ""}`);
r = await upload(A_OWNER, `${PH_B}/cross-${Date.now()}.pdf`);
check("owner cannot upload under another pharmacy's prefix", r.status >= 400, `${r.status} ${r.body?.message || ""}`);
r = await upload(A_STAFF, `${PH_A}/staff-${Date.now()}.pdf`);
check("staff cannot upload documents (owner/admin only)", r.status >= 400, `${r.status} ${r.body?.message || ""}`);
r = await fetch(`${BASE}/storage/v1/object/list/documents`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${B_OWNER}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: `${PH_A}/`, limit: 50 }) });
const listed = await r.json();
check("other pharmacy cannot list this pharmacy's documents", Array.isArray(listed) && listed.length === 0, `n=${Array.isArray(listed) ? listed.length : JSON.stringify(listed).slice(0, 60)}`);


// 9. Document upload + metadata is recoverable: a failed metadata write must
// not leave an orphaned object behind (mirrors createDocumentWithFile()).
const orphanPath = `${PH_A}/orphan-${Date.now()}.pdf`;
r = await upload(A_OWNER, orphanPath);
check("compensation setup: file uploaded", r.status === 200, `${r.status}`);
// Force the metadata insert to fail (foreign pharmacy), as the client would see.
r = await call(A_OWNER, "/rest/v1/documents", { method: "POST", body: JSON.stringify({ pharmacy_id: PH_B, name: "orphan", category: "licence", storage_path: orphanPath }) });
check("metadata insert fails for a foreign pharmacy", r.status >= 400, `${r.status}`);
// Compensating delete, exactly what the client performs in its catch block.
r = await fetch(`${BASE}/storage/v1/object/documents/${orphanPath}`, { method: "DELETE", headers: { apikey: ANON, Authorization: `Bearer ${A_OWNER}` } });
check("compensating delete removes the uploaded file", r.status === 200, `${r.status}`);
r = await fetch(`${BASE}/storage/v1/object/list/documents`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${A_OWNER}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: `${PH_A}/`, search: "orphan", limit: 50 }) });
const orphans = await r.json();
check("no orphaned file remains in storage", Array.isArray(orphans) && orphans.length === 0, `n=${Array.isArray(orphans) ? orphans.length : "?"}`);
r = await call(A_OWNER, "/rest/v1/documents?name=eq.orphan&select=id");
check("no orphaned metadata row remains", Array.isArray(r.body) && r.body.length === 0, `n=${r.body?.length}`);

console.log(`\n# ${pass + fail} API checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
