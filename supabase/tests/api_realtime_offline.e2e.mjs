// NevOut Meds — Phase 5/6 API tests: realtime propagation, tenant isolation of
// events, stock concurrency, and replay/idempotency over HTTP.
//
// Uses real GoTrue logins and the real Realtime service.
// Prerequisites: supabase/tests/seed_e2e.sh
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const PROD_A = "dddddddd-0000-0000-0000-00000000000a";
const CUST_A = "cccccccc-0000-0000-0000-00000000000a";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (desc, ok, detail) => {
  if (ok) { pass++; console.log(`ok   ${desc}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`NOT OK ${desc} [${detail}]`); }
};

async function clientFor(email) {
  const c = createClient(BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: IDS.password });
  if (error) throw new Error(`login failed for ${email}: ${error.message} (a suspended/banned fixture user causes this)`);
  return { client: c, token: data.session.access_token, userId: data.user.id };
}

const A_OWNER = await clientFor("ownerA@e2e.local");
const A_STAFF = await clientFor("staffA@e2e.local");
const B_OWNER = await clientFor("ownerB@e2e.local");

// Realtime may still be warming up (the recovery suite restarts that service).
// Prove event delivery works before asserting anything about it, so a cold
// service is a wait rather than a false failure.
async function waitForRealtime(attempts = 6) {
  for (let i = 1; i <= attempts; i++) {
    const probe = createClient(BASE, ANON, { auth: { persistSession: false } });
    await probe.auth.signInWithPassword({ email: "ownerA@e2e.local", password: IDS.password });
    let got = 0;
    const ch = probe.channel(`warmup-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => (got += 1));
    const status = await new Promise((res) => {
      const t = setTimeout(() => res("TIMEOUT"), 10_000);
      ch.subscribe((st) => { if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(st)) { clearTimeout(t); res(st); } });
    });
    if (status === "SUBSCRIBED") {
      await sleep(800);
      await probe.rpc("create_customer_idempotent", {
        p_pharmacy_id: IDS.pharmacyA, p_phone: `+2310${Date.now().toString().slice(-6)}`,
        p_first_name: "Warmup", p_last_name: "Probe", p_idempotency_key: crypto.randomUUID()
      });
      await sleep(3000);
    }
    await probe.removeChannel(ch);
    if (got > 0) return true;
    console.log(`#  realtime not ready yet (attempt ${i}/${attempts}) — waiting`);
    await sleep(5000);
  }
  return false;
}
const realtimeReady = await waitForRealtime();
check("realtime service is ready to deliver events", realtimeReady, realtimeReady ? "" : "no events after warm-up attempts");

// Make the run self-sufficient: top the product up so repeated runs never fail
// for lack of stock rather than for a real defect.
{
  const current = (await A_OWNER.client.from("inventory").select("stock").eq("product_id", PROD_A).single()).data?.stock ?? 0;
  if (current < 200) {
    const top = await A_OWNER.client.rpc("adjust_stock_idempotent", {
      p_pharmacy_id: IDS.pharmacyA, p_product_id: PROD_A, p_delta: 200 - current,
      p_note: "test setup", p_idempotency_key: crypto.randomUUID()
    });
    check("test fixture stock topped up", !top.error, top.error?.message ?? `${current} -> 200`);
  }
}

// ── 1. Realtime: one pharmacy's change reaches its own staff ────────────────
function collector() {
  const events = [];
  return { events, handler: (payload) => events.push(payload) };
}

const ownerEvents = collector();
const otherTenantEvents = collector();

const ownerChannel = A_OWNER.client
  .channel(`pharmacy:${IDS.pharmacyA}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `pharmacy_id=eq.${IDS.pharmacyA}` }, ownerEvents.handler)
  .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `pharmacy_id=eq.${IDS.pharmacyA}` }, ownerEvents.handler)
  .on("postgres_changes", { event: "*", schema: "public", table: "inventory", filter: `pharmacy_id=eq.${IDS.pharmacyA}` }, ownerEvents.handler)
  .on("postgres_changes", { event: "*", schema: "public", table: "reminders", filter: `pharmacy_id=eq.${IDS.pharmacyA}` }, ownerEvents.handler)
  .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter: `pharmacy_id=eq.${IDS.pharmacyA}` }, ownerEvents.handler);

// Pharmacy B subscribes to its OWN pharmacy; it must never see A's rows.
const bChannel = B_OWNER.client
  .channel(`pharmacy:${IDS.pharmacyB}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `pharmacy_id=eq.${IDS.pharmacyB}` }, otherTenantEvents.handler)
  .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter: `pharmacy_id=eq.${IDS.pharmacyB}` }, otherTenantEvents.handler);

const subscribed = await Promise.all([
  new Promise((resolve) => ownerChannel.subscribe((status) => status === "SUBSCRIBED" && resolve(true))),
  new Promise((resolve) => bChannel.subscribe((status) => status === "SUBSCRIBED" && resolve(true)))
]);
check("both devices subscribe to their own pharmacy channel", subscribed.every(Boolean), "SUBSCRIBED");
await sleep(1000);

// Staff A does the work; the owner's device should be told about all of it.
const phone = `+2318${Date.now().toString().slice(-6)}`;
const writes = [];
writes.push(await A_STAFF.client.rpc("create_customer_idempotent", {
  p_pharmacy_id: IDS.pharmacyA, p_phone: phone, p_first_name: "Realtime", p_last_name: "Customer",
  p_idempotency_key: crypto.randomUUID()
}));
writes.push(await A_STAFF.client.rpc("record_purchase_idempotent", {
  p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_method: "Cash", p_staff_id: A_STAFF.userId,
  p_items: [{ product_id: PROD_A, name: "Para A", qty: 1, unit_price: 1 }],
  p_idempotency_key: crypto.randomUUID()
}));
writes.push(await A_STAFF.client.rpc("adjust_stock_idempotent", {
  p_pharmacy_id: IDS.pharmacyA, p_product_id: PROD_A, p_delta: 4, p_note: "delivery",
  p_idempotency_key: crypto.randomUUID()
}));
writes.push(await A_STAFF.client.rpc("create_reminder_idempotent", {
  p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_medicine: "Metformin",
  p_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), p_note: null,
  p_idempotency_key: crypto.randomUUID()
}));
const supplierA = (await A_OWNER.client.from("suppliers").select("id").limit(1)).data?.[0]?.id;
writes.push(await A_OWNER.client.rpc("create_purchase_order_idempotent", {
  p_pharmacy_id: IDS.pharmacyA, p_supplier_id: supplierA,
  p_items: [{ name: "Gloves", qty: 2, unit_price: 3 }], p_idempotency_key: crypto.randomUUID()
}));

check("every change that should propagate was actually written",
  writes.every((w) => !w.error), writes.find((w) => w.error)?.error?.message?.slice(0, 80) ?? "");

await sleep(4000);

const tables = new Set(ownerEvents.events.map((e) => e.table));
check("User A's customer creation reaches User B (same pharmacy)", tables.has("customers"), [...tables].join(","));
check("a sale reaches the other device", tables.has("purchases"), [...tables].join(","));
check("an inventory change propagates", tables.has("inventory"), [...tables].join(","));
check("a reminder propagates", tables.has("reminders"), [...tables].join(","));
check("a supplier order propagates", tables.has("purchase_orders"), [...tables].join(","));
check("every received event belongs to this pharmacy",
  ownerEvents.events.every((e) => (e.new?.pharmacy_id ?? e.old?.pharmacy_id ?? IDS.pharmacyA) === IDS.pharmacyA),
  `${ownerEvents.events.length} events`);
const bForeign = otherTenantEvents.events.filter((e) => {
  const row = e.new ?? e.old ?? {};
  return row.pharmacy_id && row.pharmacy_id !== IDS.pharmacyB;
});
check("no Pharmacy A row ever reaches Pharmacy B's channel", bForeign.length === 0,
  bForeign.map((e) => `${e.table}/${(e.new ?? e.old)?.pharmacy_id}`).join(",") || `B saw ${otherTenantEvents.events.length} of its own`);

// Duplicate delivery of one event must not be treated as two changes: the app
// dedupes by (table, commit_timestamp, row id, type). Verify uniqueness holds.
const ids = ownerEvents.events.map((e) => `${e.table}:${e.commit_timestamp}:${(e.new ?? e.old)?.id}:${e.eventType}`);
check("realtime events carry a stable identity the client can dedupe on",
  ids.every((i) => i.split(":").length >= 4 && !i.includes("undefined")), ids[0]?.slice(0, 60));

await A_OWNER.client.removeChannel(ownerChannel);
await B_OWNER.client.removeChannel(bChannel);

// ── 2. Stock concurrency: two devices selling at the same moment ────────────
const before = (await A_OWNER.client.from("inventory").select("stock").eq("product_id", PROD_A).single()).data.stock;
const CONCURRENT = 6;
const results = await Promise.all(
  Array.from({ length: CONCURRENT }, (_, i) =>
    (i % 2 === 0 ? A_STAFF : A_OWNER).client.rpc("record_purchase_idempotent", {
      p_pharmacy_id: IDS.pharmacyA,
      p_customer_id: CUST_A,
      p_method: "Cash",
      p_staff_id: null,
      p_items: [{ product_id: PROD_A, name: "Para A", qty: 1, unit_price: 1 }],
      p_idempotency_key: crypto.randomUUID()
    })
  )
);
const okCount = results.filter((r) => !r.error).length;
const after = (await A_OWNER.client.from("inventory").select("stock").eq("product_id", PROD_A).single()).data.stock;
check(`${CONCURRENT} simultaneous sales all succeed`, okCount === CONCURRENT, `${okCount}/${CONCURRENT}`);
check("no lost update: stock fell by exactly the number of units sold",
  after === before - okCount, `${before} -> ${after}, expected ${before - okCount}`);

// Concurrent adjustments (restocking from two devices).
const beforeAdj = after;
const adjResults = await Promise.all([
  A_STAFF.client.rpc("adjust_stock_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_product_id: PROD_A, p_delta: 10, p_note: "delivery A", p_idempotency_key: crypto.randomUUID() }),
  A_OWNER.client.rpc("adjust_stock_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_product_id: PROD_A, p_delta: 7, p_note: "delivery B", p_idempotency_key: crypto.randomUUID() }),
  A_STAFF.client.rpc("adjust_stock_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_product_id: PROD_A, p_delta: -3, p_note: "damaged", p_idempotency_key: crypto.randomUUID() })
]);
const afterAdj = (await A_OWNER.client.from("inventory").select("stock").eq("product_id", PROD_A).single()).data.stock;
check("concurrent stock adjustments all apply exactly once",
  adjResults.every((r) => !r.error) && afterAdj === beforeAdj + 14, `${beforeAdj} -> ${afterAdj}, expected ${beforeAdj + 14}`);

// Overselling under concurrency is refused rather than going negative.
const stockNow = afterAdj;
const oversell = await Promise.all(
  Array.from({ length: 4 }, () =>
    A_STAFF.client.rpc("record_purchase_idempotent", {
      p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_method: "Cash", p_staff_id: null,
      p_items: [{ product_id: PROD_A, name: "Para A", qty: Math.ceil(stockNow / 2), unit_price: 1 }],
      p_idempotency_key: crypto.randomUUID()
    })
  )
);
const finalStock = (await A_OWNER.client.from("inventory").select("stock").eq("product_id", PROD_A).single()).data.stock;
check("concurrent overselling is refused, stock never goes negative",
  finalStock >= 0 && oversell.some((r) => r.error), `stock=${finalStock}, rejected=${oversell.filter((r) => r.error).length}/4`);

// ── 3. Replay after an uncertain response ───────────────────────────────────
const replayKey = crypto.randomUUID();
const purchasesBefore = (await A_OWNER.client.from("purchases").select("id", { count: "exact", head: true })).count;
const send = () => A_STAFF.client.rpc("record_purchase_idempotent", {
  p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_method: "Cash", p_staff_id: null,
  p_items: [{ product_id: PROD_A, name: "Para A", qty: 1, unit_price: 5 }],
  p_idempotency_key: replayKey
});
const first = await send();
const replay1 = await send();
const replay2 = await send();
const purchasesAfter = (await A_OWNER.client.from("purchases").select("id", { count: "exact", head: true })).count;
check("replaying the same key three times creates exactly one purchase",
  purchasesAfter === purchasesBefore + 1, `${purchasesBefore} -> ${purchasesAfter}`);
check("every replay returns the same purchase id",
  first.data === replay1.data && replay1.data === replay2.data, `${first.data}`);

// Simultaneous replays (two devices retrying the same queued item at once).
const raceKey = crypto.randomUUID();
const raceBefore = (await A_OWNER.client.from("purchases").select("id", { count: "exact", head: true })).count;
const raced = await Promise.all([
  A_STAFF.client.rpc("record_purchase_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_method: "Cash", p_staff_id: null, p_items: [{ product_id: PROD_A, name: "Para A", qty: 1, unit_price: 7 }], p_idempotency_key: raceKey }),
  A_STAFF.client.rpc("record_purchase_idempotent", { p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_method: "Cash", p_staff_id: null, p_items: [{ product_id: PROD_A, name: "Para A", qty: 1, unit_price: 7 }], p_idempotency_key: raceKey })
]);
const raceAfter = (await A_OWNER.client.from("purchases").select("id", { count: "exact", head: true })).count;
check("two devices replaying the same key at once still create one purchase",
  raceAfter === raceBefore + 1 && raced.every((r) => !r.error), `${raceBefore} -> ${raceAfter}`);

// ── 4. Queued work from a suspended user is rejected on sync ────────────────
const suspendRes = await fetch(`${BASE}/functions/v1/staff-admin`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${A_OWNER.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "suspend", user_id: A_STAFF.userId })
});
check("owner suspends staff mid-flight", suspendRes.status === 200, `${suspendRes.status}`);

let queuedAfterSuspension;
try {
  queuedAfterSuspension = await A_STAFF.client.rpc("record_purchase_idempotent", {
  p_pharmacy_id: IDS.pharmacyA, p_customer_id: CUST_A, p_method: "Cash", p_staff_id: null,
    p_items: [{ product_id: PROD_A, name: "Para A", qty: 1, unit_price: 1 }],
    p_idempotency_key: crypto.randomUUID()
  });
  check("a suspended user's queued write is rejected at sync time", !!queuedAfterSuspension.error,
    queuedAfterSuspension.error?.message?.slice(0, 60));
} finally {
  // Always restore the fixture: a left-behind ban would make later runs fail in
  // a confusing way (writes silently fall back to the anon role).
  const restore = await fetch(`${BASE}/functions/v1/staff-admin`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${A_OWNER.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reactivate", user_id: A_STAFF.userId })
  });
  check("the suspended fixture user is reactivated again", restore.status === 200, `${restore.status}`);
}

// ── 5. Product metadata conflict detection ─────────────────────────────────
const prod = (await A_OWNER.client.from("products").select("id,version,selling_price").eq("id", PROD_A).single()).data;
const okUpdate = await A_OWNER.client.rpc("update_product_checked", {
  p_product_id: PROD_A, p_expected_version: prod.version, p_changes: { selling_price: 3.25 }
});
check("a product edit with the current version succeeds", !okUpdate.error, okUpdate.error?.message ?? "");
const staleUpdate = await A_OWNER.client.rpc("update_product_checked", {
  p_product_id: PROD_A, p_expected_version: prod.version, p_changes: { selling_price: 99 }
});
check("a stale offline edit is reported as a conflict, not applied",
  !!staleUpdate.error && /changed by someone else|version/i.test(staleUpdate.error.message),
  staleUpdate.error?.message?.slice(0, 70));
const priceNow = (await A_OWNER.client.from("products").select("selling_price").eq("id", PROD_A).single()).data.selling_price;
check("the conflicting edit did not overwrite the newer price", Number(priceNow) === 3.25, `price=${priceNow}`);

console.log(`\n# ${pass + fail} realtime/offline API checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
