// NevOut Meds — Phase 9: country configuration unit tests (no browser, no DB).
//
// Bundles client/src/platform/country with esbuild and checks money, phone,
// business-date and payment-method behaviour for every supported country, plus
// parity between the client profiles and the server registry in migration 0018.
//
// Usage: node supabase/tests/country_config.test.mjs
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Written under node_modules/.cache so the external `react` import resolves.
const out = join(ROOT, "node_modules/.cache/nv-country-test/country.mjs");
await build({
  entryPoints: [join(ROOT, "client/src/platform/country/index.ts")],
  bundle: true, format: "esm", platform: "neutral", outfile: out, logLevel: "error",
  alias: { "@": join(ROOT, "client/src") },
  external: ["react", "react/jsx-runtime"], jsx: "automatic"
});
const C = await import(pathToFileURL(out).href);

let n = 0, failed = 0;
function check(desc, ok, detail = "") {
  n++;
  if (!ok) failed++;
  console.log(`${ok ? "ok" : "not ok"} ${n} - ${desc}${detail ? ` [${detail}]` : ""}`);
}
const eq = (desc, got, want) => check(desc, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── Money (Part E) ──────────────────────────────────────────────────────────
eq("USD is never a bare $ (Liberia also uses L$)", C.formatMoney(1234.5, "USD"), "US$1,234.50");
eq("LRD", C.formatMoney(1234.5, "LRD"), "L$1,234.50");
eq("SLE", C.formatMoney(1234.5, "SLE"), "Le 1,234.50");
eq("GHS", C.formatMoney(1234.5, "GHS"), "GH₵1,234.50");
eq("NGN", C.formatMoney(1234.5, "NGN"), "₦1,234.50");
eq("GMD", C.formatMoney(1234.5, "GMD"), "D 1,234.50");
eq("KES", C.formatMoney(1234.5, "KES"), "KSh 1,234.50");
eq("RWF has no minor unit", C.formatMoney(1234.5, "RWF"), "FRw 1,235");
eq("digits are capped at the currency's own", C.formatMoney(1500, "RWF", { digits: 2 }), "FRw 1,500");
eq("negative amounts put the sign first", C.formatMoney(-12, "GHS"), "-GH₵12.00");
eq("compact", C.formatMoney(12500, "KES", { compact: true }), "KSh 12.5k");
eq("an unknown currency shows its code, never a guessed symbol", C.formatMoney(12, "XOF"), "12.00 XOF");
eq("code-only form for exports", C.formatMoney(12, "USD", { codeOnly: true }), "12.00 USD");
eq("null and NaN never render as NaN", [C.formatMoney(null, "USD"), C.formatMoney("abc", "USD")], ["US$0.00", "US$0.00"]);
eq("locale grouping (fr-RW uses a narrow space)", C.formatMoney(1500, "RWF", { locale: "fr-RW" }).replace(/\s/g, " "), "FRw 1 500");
eq("RWF input is rounded to whole francs before it is sent", C.toMinorUnitString(1499.6, "RWF"), "1500");
eq("USD input keeps two decimals as a string (no float noise)", C.toMinorUnitString(0.1 + 0.2, "USD"), "0.30");
eq("money input step", [C.moneyInputStep("USD"), C.moneyInputStep("RWF")], ["0.01", "1"]);

// ── Multi-currency (Part X) ─────────────────────────────────────────────────
const rows = [{ c: "USD", a: 10 }, { c: "LRD", a: 1900 }, { c: "USD", a: 5 }];
eq("totals are grouped per currency, never summed across", C.totalsByCurrency(rows, (r) => r.c, (r) => r.a),
  [{ currency: "LRD", total: 1900, count: 1 }, { currency: "USD", total: 15, count: 2 }]);
check("same-currency guard", C.sameCurrency(["USD", "USD", null]) && !C.sameCurrency(["USD", "LRD"]));

// ── Tenant config + active money ────────────────────────────────────────────
eq("before sign-in the app behaves as the Liberian pilot", C.money(12.5), "US$12.50");
const gh = C.resolveTenantConfig({ country_code: "GH", default_currency: "GHS", timezone: "Africa/Accra", locale: "en-GH", payment_methods: null });
C.setActiveTenantConfig(gh);
eq("a Ghanaian pharmacy formats in cedi", C.money(12.5), "GH₵12.50");
eq("an explicit currency wins (supplier price in USD)", C.moneyIn(3, "USD"), "US$3.00");
const bad = C.resolveTenantConfig({ country_code: "KE", default_currency: "USD", timezone: "Europe/London", locale: "xx", payment_methods: ["Diaspora Pay", "Cash"] });
eq("invalid values fall back to the country's defaults, never a guess", [bad.currency, bad.timezone, bad.locale, bad.paymentMethods],
  ["KES", "Africa/Nairobi", "en-KE", ["Cash"]]);
eq("an unknown country resolves to the Liberia defaults", C.resolveTenantConfig({ country_code: "ZZ" }).countryCode, "LR");
C.setActiveTenantConfig(null);
eq("clearing the tenant restores the Liberia default", C.money(1), "US$1.00");

// ── Payment methods (Part K) ────────────────────────────────────────────────
eq("Liberia's till is unchanged (same methods, same order)", C.getPaymentMethods({ countryCode: "LR" }),
  ["Cash", "Mobile Money", "Credit", "Insurance", "Diaspora Pay"]);
eq("Kenya defaults", C.getPaymentMethods({ countryCode: "KE" }), ["Cash", "Mobile Money", "Credit"]);
eq("a stale cached method the country doesn't allow is never offered", C.getPaymentMethods({ countryCode: "GH", paymentMethods: ["Diaspora Pay", "Card"] }), ["Card"]);

// ── Phones (Part H) ─────────────────────────────────────────────────────────
const phones = [
  ["LR", "0770123456", "+231770123456", "+231 77 012 3456"],
  ["LR", "+231 77 012 3456", "+231770123456", "+231 77 012 3456"],
  ["LR", "231770123456", "+231770123456", "+231 77 012 3456"],
  ["SL", "076 012345", "+23276012345", "+232 76 012345"],
  ["GH", "024 012 3456", "+233240123456", "+233 24 012 3456"],
  ["NG", "0803 012 3456", "+2348030123456", "+234 803 012 3456"],
  ["GM", "301 2345", "+2203012345", "+220 301 2345"],
  ["KE", "0712 012345", "+254712012345", "+254 712 012345"],
  ["RW", "0788 012 345", "+250788012345", "+250 788 012 345"]
];
for (const [cc, input, e164, pretty] of phones) {
  const p = C.parsePhone(input, cc);
  eq(`${cc} "${input}" → ${e164}`, p.ok ? p.e164 : p.error, e164);
  eq(`${cc} displays as ${pretty}`, C.formatPhone(input, cc), pretty);
}
eq("a Ghanaian customer's number is accepted by a Liberian pharmacy", C.parsePhone("+233 24 012 3456", "LR").country, "GH");
check("a too-short number is refused with an example", !C.parsePhone("0770", "LR").ok && /077 012 3456/.test(C.parsePhone("0770", "LR").error));
check("an unsupported country code is refused", !C.parsePhone("+44 20 7946 0000", "LR").ok);
eq("legacy free text is displayed exactly as stored", C.formatPhone("call Musu at shop", "LR"), "call Musu at shop");
eq("WhatsApp digits", C.whatsappDigits("0712 012345", "KE"), "254712012345");

// ── Business dates (Part F/G) ───────────────────────────────────────────────
// 21:30 UTC on 1 Mar is already 2 Mar in Nairobi (UTC+3) but still 1 Mar in Monrovia.
const lateUtc = new Date("2027-03-01T21:30:00Z");
eq("Kenya: 21:30 UTC is the next business day", C.businessDayKey(lateUtc, "Africa/Nairobi"), "2027-03-02");
eq("Liberia: the same instant is still the same day (UTC+0)", C.businessDayKey(lateUtc, "Africa/Monrovia"), "2027-03-01");
eq("Rwanda: 23:30 UTC is the next business day", C.businessDayKey(new Date("2027-03-01T23:30:00Z"), "Africa/Kigali"), "2027-03-02");
eq("UTC midnight exactly is 00:00 in Monrovia", C.businessDayKey(new Date("2027-03-02T00:00:00Z"), "Africa/Monrovia"), "2027-03-02");
eq("one second before UTC midnight is still yesterday in Monrovia", C.businessDayKey(new Date("2027-03-01T23:59:59Z"), "Africa/Monrovia"), "2027-03-01");
eq("start of a Nairobi business day is 21:00 UTC the evening before", C.startOfBusinessDay("2027-03-02", "Africa/Nairobi").toISOString(), "2027-03-01T21:00:00.000Z");
eq("start of a Kigali business day", C.startOfBusinessDay("2027-03-02", "Africa/Kigali").toISOString(), "2027-03-01T22:00:00.000Z");
eq("start of a Lagos business day", C.startOfBusinessDay("2027-03-02", "Africa/Lagos").toISOString(), "2027-03-01T23:00:00.000Z");
eq("start of a Monrovia business day", C.startOfBusinessDay("2027-03-02", "Africa/Monrovia").toISOString(), "2027-03-02T00:00:00.000Z");
eq("calendar arithmetic across month ends", [C.addDays("2027-02-28", 1), C.addDays("2028-02-28", 1), C.daysBetween("2027-02-20", "2027-03-02")], ["2027-03-01", "2028-02-29", 10]);
eq("a date-only value (expiry) is never shifted by a timezone", C.formatDate("2027-03-12", { timeZone: "Pacific/Kiritimati", locale: "en-GB" }), "12 Mar 2027");
eq("a timestamp is shown in the pharmacy's timezone", C.formatDate("2027-03-01T21:30:00Z", { timeZone: "Africa/Nairobi", locale: "en-GB" }), "2 Mar 2027");
check("dates always carry a four-digit year", /2027/.test(C.formatDate("2027-03-12", { locale: "en-KE" })));

// ── Address, regulatory, tax (Parts I/J/L/M) ────────────────────────────────
eq("Liberia keeps County in the existing column", C.getAddressFields("LR", { forCustomers: true }).map((f) => [f.key, f.label, f.column]),
  [["landmark", "Nearest landmark", "landmark"], ["community", "Community", "community"], ["admin_area_1", "County", "county"]]);
eq("the stable key keeps its storage column across countries", ["GH", "NG", "KE", "RW"].map((c) => C.getAddressFields(c).find((f) => f.key === "admin_area_1").column), ["county", "county", "county", "county"]);
eq("labels follow the country", ["LR", "GH", "NG", "KE", "RW"].map((c) => C.addressLabel(c, "admin_area_1")), ["County", "Region", "State", "County", "Province"]);
check("no country ships a tax rate", C.COUNTRY_CODES.every((c) => C.getTaxPolicy(c).certainty === "RESEARCH_REQUIRED" && !/\d+(\.\d+)?\s*%/.test(C.getTaxPolicy(c).note)));
check("licence fields are marked research-required everywhere", C.COUNTRY_CODES.every((c) => C.getRegulatoryFields(c).find((f) => f.key === "premises_licence_no").certainty === "RESEARCH_REQUIRED"));

// ── Client ↔ server registry parity ─────────────────────────────────────────
const sql = readFileSync(join(ROOT, "supabase/migrations/0018_country_tenant_model.sql"), "utf8");
const arr = (s) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const code of C.COUNTRY_CODES) {
  const m = sql.match(new RegExp(`\\('${code}',\\s*'[^']+',\\s*array\\[([^\\]]*)\\],\\s*array\\[([^\\]]*)\\],\\s*array\\[([^\\]]*)\\],\\s*array\\[([^\\]]*)\\],\\s*array\\[([^\\]]*)\\]\\)`));
  if (!m) { check(`${code} exists in private.country_rules`, false); continue; }
  const p = C.COUNTRY_PROFILES[code];
  const set = (a) => [...a].sort().join(",");
  check(`${code}: client profile matches the server registry`,
    arr(m[1]).join() === p.currencies.join() && arr(m[2]).join() === p.timezones.join() && arr(m[3]).join() === p.locales.join()
      && set(arr(m[4])) === set(p.paymentMethods) && set(arr(m[5])) === set(p.defaultPaymentMethods),
    `${arr(m[1])} / ${arr(m[2])} / ${arr(m[3])}`);
}

console.log(`# ${n} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
