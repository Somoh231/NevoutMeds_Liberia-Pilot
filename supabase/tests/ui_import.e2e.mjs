// NevOut Meds — spreadsheet import (Phase 10: first-pharmacy data setup).
// Pins the import behaviour documented in docs/pilot/DATA_IMPORT_GUIDE.md:
// header matching, strict numbers and dates (never silently 0 or misread),
// in-file duplicates, "update" vs "leave unchanged", E.164 phones, XLSX number
// and date cells, and row-numbered problem reports. Synthetic data only.
//
// Usage: APP_BASE=<local build> NEVOUT_API_URL=<local supabase> CHROME=<path> UDD=<dir> OUT=<dir> \
//          node supabase/tests/ui_import.e2e.mjs
// Prerequisites: seed_e2e.sh (LOCAL stack). Refuses the production project.
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { API, IDS, apiLogin, api, browser, reporter, sleep } from "./lib/harness.mjs";

if (API.includes("qohpyeqyveusnxhnbtxz")) { console.error("refusing to run against production"); process.exit(2); }

const { check, done } = reporter();
const OUT = process.env.OUT || fs.mkdtempSync("/tmp/nv-import-");
const file = (name, content) => { const p = path.join(OUT, name); fs.writeFileSync(p, content); return p; };
const token = await apiLogin("ownerA@e2e.local");
const { rest } = api(token);
const products = async () => Object.fromEntries((await rest(`products?select=name,unit_cost,selling_price,reorder_point,inventory(stock,expiry_date,batch_id)&name=ilike.imp%20test*`)).map((p) => [p.name, p]));
const customers = async () => (await rest(`customers?select=first_name,last_name,phone,community,credit_limit&first_name=eq.Imp&order=last_name`));

const b = await browser({ port: 9391, out: OUT });
await b.viewport("laptop");
await b.reset();
check("owner signs in", (await b.signIn("ownerA@e2e.local")) === "/platform");

async function upload(kind, p, mode) {
  await b.go("/import", 2500);
  await b.clickText(`^${kind}$`); await sleep(300);
  const doc = await b.send("DOM.getDocument", {});
  const q = await b.send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "input[type=file]" });
  await b.send("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: [p] });
  await b.waitFor(`/Preview \\(|Missing required|Unsupported|larger than/.test(document.body.innerText)`, 8000);
  if (mode === "skip") await b.clickText("^Leave them unchanged");
  const preview = await b.ev(`document.body.innerText`);
  await b.clickText("^Import →$");
  await b.waitFor(`document.body.innerText.includes('Import finished')`, 15000);
  await sleep(400);
  return { preview, after: await b.ev(`document.body.innerText`) };
}

// ── Products: header names, strict numbers, in-file duplicates ─────────────
let r = await upload("Products", file("products.csv", [
  "Name,Category,Unit Cost,Selling Price,Reorder Point,Unit",
  "Imp Test Paracetamol 500mg,Analgesic,0.80,1.50,20,tablet",
  'Imp Test Amoxicillin 250mg,Antibiotic,"1,200",2000,10,capsule',
  "Imp Test Bad Price,Analgesic,$5.00,6,,",
  "Imp Test Missing Cat,,1,2,,",
  "imp test paracetamol 500mg,Analgesic,0.9,1.6,,",
  "Imp Test Fraction Reorder,Analgesic,1,2,2.5,"
].join("\n")));
check("capitalised headers with spaces are accepted", !/Missing required/.test(r.preview), r.preview.match(/Missing required[^\n]*/)?.[0] ?? "accepted");
let P = await products();
check("valid products are saved with exact prices", P["Imp Test Paracetamol 500mg"]?.unit_cost === 0.8 && P["Imp Test Paracetamol 500mg"]?.selling_price === 1.5 && P["Imp Test Paracetamol 500mg"]?.reorder_point === 20, JSON.stringify(P["Imp Test Paracetamol 500mg"]));
check("thousands separators are read, not zeroed", P["Imp Test Amoxicillin 250mg"]?.unit_cost === 1200, String(P["Imp Test Amoxicillin 250mg"]?.unit_cost));
check("a price with a currency symbol is rejected, not saved as 0", !P["Imp Test Bad Price"] && /unit_cost must be a number without currency symbols[^;]*row 4/.test(r.after), r.after.match(/unit_cost must[^;]*/)?.[0]);
check("a missing required value is reported with its row", /missing category \(row 5\)/.test(r.after), r.after.match(/missing category[^;]*/)?.[0]);
check("a repeated name in the same file is reported, not a failed import", /same product name as row 2 \(row 6\)/.test(r.after) && Object.keys(P).length === 2, Object.keys(P).join(" | "));
check("a fractional reorder point is rejected", /reorder_point must be a whole number \(row 7\)/.test(r.after));
check("the result says what happened", /Import finished: 2 row\(s\) added or updated · 4 not imported/.test(r.after), r.after.match(/Import finished[^\n]*/)?.[0]);
check("no developer wording on the import screen", !/hardening|Upsert/.test(r.after));

// ── Products: "leave unchanged" really skips; "update" really updates ──────
r = await upload("Products", file("products2.csv", "name,category,unit_cost,selling_price\nImp Test Paracetamol 500mg,Analgesic,0.80,9.99\nImp Test Zinc 20mg,Supplement,0.2,0.5\n"), "skip");
P = await products();
check("'leave unchanged' keeps the existing product exactly", P["Imp Test Paracetamol 500mg"]?.selling_price === 1.5, String(P["Imp Test Paracetamol 500mg"]?.selling_price));
check("'leave unchanged' still adds the new product", !!P["Imp Test Zinc 20mg"]);
check("'leave unchanged' reports what already existed", /1 row\(s\) added · 1 already existed and were left unchanged/.test(r.after), r.after.match(/Import finished[^\n]*/)?.[0]);
r = await upload("Products", file("products3.csv", "name,category,unit_cost,selling_price\nImp Test Paracetamol 500mg,Analgesic,0.85,1.75\n"));
P = await products();
check("'update' changes the existing product", P["Imp Test Paracetamol 500mg"]?.selling_price === 1.75 && P["Imp Test Paracetamol 500mg"]?.unit_cost === 0.85);

// ── Inventory: blank stock, day/month dates, unknown products, row numbers ──
r = await upload("Inventory", file("inventory.csv", [
  "Product Name,Stock,Batch ID,Expiry Date",
  "Imp Test Paracetamol 500mg,120,B1,2027-03-31",
  "Imp Test Amoxicillin 250mg,,B2,",
  "Imp Test Zinc 20mg,40,,31/12/2027",
  "No Such Product,5,,",
  "Imp Test Zinc 20mg,7,,"
].join("\n")));
P = await products();
const inv = (n) => [P[n]?.inventory].flat()[0] ?? null;
check("stock and expiry are set from the file", inv("Imp Test Paracetamol 500mg")?.stock === 120 && inv("Imp Test Paracetamol 500mg")?.expiry_date === "2027-03-31" && inv("Imp Test Paracetamol 500mg")?.batch_id === "B1", JSON.stringify(inv("Imp Test Paracetamol 500mg")));
check("a blank stock cell is rejected, not set to 0", !inv("Imp Test Amoxicillin 250mg") && /missing stock \(row 3\)/.test(r.after), JSON.stringify(inv("Imp Test Amoxicillin 250mg")));
check("a day/month date is rejected, not misread", /expiry_date must be a date written YYYY-MM-DD[^;]*row 4/.test(r.after));
check("server-side problems carry the spreadsheet row number", /no product named No Such Product \(row 5\)/.test(r.after), r.after.match(/no product named[^;]*/)?.[0]);
check("a later valid row for the same product is applied", inv("Imp Test Zinc 20mg")?.stock === 7, JSON.stringify(inv("Imp Test Zinc 20mg")));
const moves = await rest(`stock_movements?select=delta,note,products!inner(name)&products.name=eq.Imp%20Test%20Paracetamol%20500mg`);
check("the import is recorded as a stock movement", moves.length === 1 && moves[0].delta === 120 && moves[0].note === "stock import", JSON.stringify(moves));

// ── Customers: phones stored as the form stores them (E.164) ────────────────
r = await upload("Customers", file("customers.csv", [
  "First Name,Last Name,Phone,Community,Credit Limit",
  "Imp,Alpha,0770 111 222,Sinkor,50",
  "Imp,Beta,+231 88 123 4567,,",
  "Imp,Gamma,12,,",
  "Imp,Delta,231770111222,,"
].join("\n")));
let C = await customers();
check("customer phones are normalised to +231…", C.map((c) => c.phone).join(",") === "+231770111222,+231881234567", C.map((c) => `${c.last_name}:${c.phone}`).join(","));
check("an invalid phone is rejected with the country rule", /phone "12": A Liberia number has/.test(r.after), r.after.match(/phone "12"[^;]*/)?.[0]);
check("the same number written differently is a duplicate", /same phone number as row 2 \(row 5\)/.test(r.after));
check("optional customer fields are kept", C[0]?.community === "Sinkor" && C[0]?.credit_limit === 50, JSON.stringify(C[0]));

// ── XLSX: numeric phones and real date cells ────────────────────────────────
const xlsx = (name, aoa) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1"); const p = path.join(OUT, name); fs.writeFileSync(p, XLSX.write(wb, { type: "buffer", bookType: "xlsx" })); return p; };
// What Excel stores when someone types 31/12/2027 into a date-formatted cell: a whole serial day number.
const excelDate = (serial, z = "m/d/yy") => ({ t: "n", v: serial, z });
r = await upload("Customers", xlsx("customers.xlsx", [["first_name", "last_name", "phone"], ["Imp", "Epsilon", 231770333444]]));
C = await customers();
check("an XLSX phone number is not turned into 2.3177E+11", C.some((c) => c.last_name === "Epsilon" && c.phone === "+231770333444"), JSON.stringify(C.find((c) => c.last_name === "Epsilon")));
r = await upload("Inventory", xlsx("inventory.xlsx", [["product_name", "stock", "expiry_date"], ["Imp Test Amoxicillin 250mg", 15, excelDate(46752)]]));
P = await products();
check("an XLSX date cell is read as the same calendar date", inv("Imp Test Amoxicillin 250mg")?.expiry_date === "2027-12-31" && inv("Imp Test Amoxicillin 250mg")?.stock === 15, JSON.stringify(inv("Imp Test Amoxicillin 250mg")));

// ── The templates shipped in docs/pilot/templates import cleanly, in order ─
const T = path.resolve("docs/pilot/templates");
for (const [kind, f] of [["Products", "products_template.csv"], ["Inventory", "inventory_template.csv"], ["Customers", "customers_template.csv"]]) {
  r = await upload(kind, path.join(T, f));
  check(`template ${f} imports with no problems`, /Import finished: \d+ row\(s\) (added|updated|added or updated)$/m.test(r.after) && !/not imported/.test(r.after), r.after.match(/Import finished[^\n]*/)?.[0]);
}
const sample = (await rest(`products?select=name,inventory(stock,expiry_date)&name=like.SAMPLE*&order=name`));
check("template stock and expiry land on the right products", sample.length === 3 && sample.find((p) => p.name === "SAMPLE Paracetamol 500mg")?.inventory?.stock === 120, JSON.stringify(sample.map((p) => [p.name, p.inventory?.stock, p.inventory?.expiry_date])));

// ── Staff cannot import ─────────────────────────────────────────────────────
await b.reset();
await b.signIn("staffA@e2e.local");
await b.go("/import", 3000);
check("staff cannot open the import screen", !(await b.ev(`!!document.querySelector('input[type=file]')`)), await b.ev(`location.pathname`));
check("no page exceptions", b.exceptions.length === 0, b.exceptions.slice(0, 2).join(" | "));

b.close();
process.exit(done("import checks") ? 1 : 0);
