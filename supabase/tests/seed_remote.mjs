// Seeds the REMOTE Supabase project with SYNTHETIC test data only.
//
// Everything created here uses @e2e.local addresses and obviously fake pharmacy
// names. No real pharmacy, patient or staff data is involved.
//
// Writes the same fixture files the local suites read, so the existing API
// tests can run unchanged against the remote project:
//   /tmp/nevout_anon.jwt, /tmp/nevout_service.jwt, /tmp/nevout_e2e_ids.json
import fs from "node:fs";

const URL = process.env.NEVOUT_API_URL || "https://qohpyeqyveusnxhnbtxz.supabase.co";
const ANON = fs.readFileSync(process.env.NEVOUT_ANON_FILE || "/tmp/claude-501/remote/anon.key", "utf8").trim();
const SERVICE = fs.readFileSync(process.env.NEVOUT_SERVICE_FILE || "/tmp/claude-501/remote/service.key", "utf8").trim();
const PASSWORD = process.env.NEVOUT_TEST_PASSWORD || "PilotTest123!";

const PH_A = "aaaaaaaa-0000-0000-0000-000000000001";
const PH_B = "bbbbbbbb-0000-0000-0000-000000000002";
const CUST_A = "cccccccc-0000-0000-0000-00000000000a";
const CUST_B = "cccccccc-0000-0000-0000-00000000000b";
const PROD_A = "dddddddd-0000-0000-0000-00000000000a";
const PROD_B = "dddddddd-0000-0000-0000-00000000000b";
const SUP_A = "11111111-aaaa-0000-0000-000000000001";
const SUP_B = "22222222-bbbb-0000-0000-000000000002";

const svc = (path, init = {}) =>
  fetch(`${URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });

// PostgREST resolves duplicates on the primary key unless told otherwise, so a
// table with a separate unique constraint needs on_conflict spelled out.
const upsert = async (table, rows, onConflict) => {
  const path = `/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`;
  const r = await svc(path, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${(await r.text()).slice(0, 160)}`);
};

console.log("== removing previous synthetic users");
const list = await (await svc("/auth/v1/admin/users?per_page=200")).json();
for (const u of (list.users ?? []).filter((u) => /@e2e\.local$/.test(u.email ?? ""))) {
  await svc(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
}

console.log("== creating synthetic auth users");
async function createUser(email) {
  const r = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true })
  });
  const j = await r.json();
  if (!j.id) throw new Error(`create ${email}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.id;
}
const ownerA = await createUser("ownerA@e2e.local");
const staffA = await createUser("staffA@e2e.local");
const ownerB = await createUser("ownerB@e2e.local");

console.log("== seeding synthetic tenants");
await upsert("pharmacies", [
  { id: PH_A, name: "E2E Pharmacy A" },
  { id: PH_B, name: "E2E Pharmacy B" }
]);
await upsert("users_profiles", [
  { id: ownerA, pharmacy_id: PH_A, role: "owner", name: "Owner A", email: "ownera@e2e.local" },
  { id: staffA, pharmacy_id: PH_A, role: "staff", name: "Staff A", email: "staffa@e2e.local" },
  { id: ownerB, pharmacy_id: PH_B, role: "owner", name: "Owner B", email: "ownerb@e2e.local" }
]);
await upsert("customers", [
  { id: CUST_A, pharmacy_id: PH_A, phone: "+2310001", first_name: "Ada", last_name: "A" },
  { id: CUST_B, pharmacy_id: PH_B, phone: "+2310002", first_name: "Ben", last_name: "B" }
]);
await upsert("suppliers", [
  { id: SUP_A, pharmacy_id: PH_A, name: "Supplier A" },
  { id: SUP_B, pharmacy_id: PH_B, name: "Supplier B" }
]);
await upsert("products", [
  { id: PROD_A, pharmacy_id: PH_A, name: "Para A", category: "Analgesic", unit_cost: 0.5, selling_price: 1 },
  { id: PROD_B, pharmacy_id: PH_B, name: "Para B", category: "Analgesic", unit_cost: 0.5, selling_price: 1 }
]);
await upsert("inventory", [
  { pharmacy_id: PH_A, product_id: PROD_A, stock: 200 },
  { pharmacy_id: PH_B, product_id: PROD_B, stock: 30 }
], "pharmacy_id,product_id");

fs.writeFileSync("/tmp/nevout_anon.jwt", ANON);
fs.writeFileSync("/tmp/nevout_service.jwt", SERVICE);
fs.writeFileSync("/tmp/nevout_e2e_ids.json", JSON.stringify(
  { ownerA, staffA, ownerB, pharmacyA: PH_A, pharmacyB: PH_B, password: PASSWORD }, null, 2));

console.log("== done (synthetic data only)");
console.log(JSON.stringify({ ownerA, staffA, ownerB, pharmacyA: PH_A, pharmacyB: PH_B }, null, 1));
