// NevOut Meds — public privacy / terms / cookies disclosures (static checks; no browser, no DB).
//
// Guards the release rules for the public legal pages: the routes exist and are linked
// from the public site, the signed-out pages and the signed-in Help dialog; the required
// statements are present; no internal drafting markers, retention periods or demo address
// leak into public text; and no tracker, cookie or consent banner has been introduced.
//
// Usage: node supabase/tests/legal_pages.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let n = 0, failed = 0;
const check = (d, ok, detail = "") => { n++; if (!ok) failed++; console.log(`${ok ? "ok" : "not ok"} ${n} - ${d}${detail ? ` [${detail}]` : ""}`); };

const LEGAL = ["client/src/pages/legal/PrivacyPage.tsx", "client/src/pages/legal/TermsPage.tsx", "client/src/pages/legal/CookiesPage.tsx", "client/src/pages/legal/LegalLayout.tsx", "client/src/platform/legal/BusinessPerformanceNotice.tsx", "client/src/platform/legal/LegalLinks.tsx"];
const text = Object.fromEntries(LEGAL.map((p) => [p, read(p)]));
const all = Object.values(text).join("\n");
const app = read("client/src/App.tsx");
const privacy = text["client/src/pages/legal/PrivacyPage.tsx"];
const cookies = text["client/src/pages/legal/CookiesPage.tsx"];
const terms = text["client/src/pages/legal/TermsPage.tsx"];
const bp = text["client/src/platform/legal/BusinessPerformanceNotice.tsx"];
const flat = (s) => s.replace(/\s+/g, " ");

// Routes and placement
for (const r of ["/privacy", "/terms", "/cookies"]) check(`route ${r} is registered without a sign-in guard`, new RegExp(`<Route path="${r}" element={<\\w+Page />} />`).test(app));
check("home page footer links the legal pages", /LEGAL_PAGES\.map/.test(read("client/src/pages/HomePage.tsx")));
check("signed-out pages (login, invite, reset) show the legal links", /<LegalLinks \/>/.test(read("client/src/platform/auth/AuthLayout.tsx")));
check("signed-in Help & feedback shows the legal links", /<LegalLinks [^>]*onNavigate={onClose}/.test(read("client/src/pages/PlatformPage.tsx")));
check("legal links are Privacy · Terms · Cookies", /\/privacy[\s\S]*Privacy[\s\S]*\/terms[\s\S]*Terms[\s\S]*\/cookies[\s\S]*Cookies/.test(text["client/src/platform/legal/LegalLinks.tsx"]));

// Required statements
check("privacy notice states the pharmacy-entered information wording", flat(privacy).includes("NevOut provides pharmacy-operating technology that may process information entered by pharmacies, including customer contact, transaction, credit and health-related information where the pharmacy uses those features."));
check("privacy notice does not claim one controller/processor classification", /can vary by country and by the relationship/.test(flat(privacy)) && !/\bNevOut is (the|a) (data )?(controller|processor)\b/i.test(privacy));
check("privacy notice is multi-country (no Tanzania/Liberia-only text)", /Additional rights, notices, consent requirements or regulatory requirements may apply depending on the country/.test(flat(privacy)) && !/Tanzania|Liberia|PDPC/.test(all));
check("privacy notice names privacy@nevoutmeds.com", /to="privacy"/.test(privacy) && /CONTACTS = PUBLIC_CONTACTS/.test(text["client/src/pages/legal/LegalLayout.tsx"]) && /privacy: "privacy@nevoutmeds\.com"/.test(read("client/src/platform/support/publicContacts.ts")));
check("privacy notice lists the sensitive pharmacy fields (not described as removed)", ["date of birth", "medical conditions, allergies and notes", "medicines bought", "refill reminders", "credit balances"].every((s) => privacy.includes(s)) && !/(removed|no longer (collect|store)|minimi[sz]ed)/i.test(privacy));
check("Business Performance notice: excludes identifiable customer health information", /does not use identifiable customer health information or individual customer records/.test(flat(bp)));
check("Business Performance notice: not a credit score; NevOut does not make lending decisions; licensed institution decides", /not a credit score/.test(bp) && /NevOut does not make lending decisions/.test(flat(bp)) && /made independently by the relevant licensed financial institution/.test(flat(bp)));
check("Business Performance notice does not imply a current lender relationship", /does not currently offer financing or share Business Performance information with lenders/.test(flat(bp)));
check("privacy notice embeds the Business Performance notice", /<BusinessPerformanceNotice \/>/.test(privacy));
check("cookies notice lists what is not used", ["advertising cookies", "advertising trackers", "marketing pixels", "behavioural advertising", "third-party analytics"].every((s) => cookies.includes(s)));
check("cookies notice covers session storage, IndexedDB, offline queue and service worker", ["Sign-in session", "IndexedDB", "Offline changes queue", "service worker"].every((s) => cookies.includes(s)));
check("cookies notice future-change sentence is verbatim", flat(cookies).includes("If NevOut later introduces optional analytics, advertising, or other non-essential tracking technologies, this notice and any required choices or consent controls will be updated before those technologies are used."));
check("terms keep statutory rights", /takes away rights that pharmacies, users, patients or consumers have under applicable law/.test(flat(terms)));
check("terms invent no governing law or jurisdiction", !/governed by the laws of|exclusive jurisdiction|courts of (Tanzania|Liberia|England|Delaware)/i.test(terms));

// What must not appear
check("no internal drafting markers in public text", !/COUNSEL REVIEW|\[PLANNED|DRAFT|OWNER TO CONFIRM|OWNER DECISION|\bPRIV-\d|\bCQ-\d|\[DPO|TO BE APPOINTED|RETENTION PERIOD TO BE|TODO/.test(all), (all.match(/COUNSEL REVIEW|\[PLANNED|DRAFT|OWNER TO|PRIV-\d|CQ-\d|TODO/) ?? [""])[0]);
check("no retention period is stated", !/\b\d+\s*(days?|weeks?|months?|years?)\b/i.test(all.replace(/© \{new Date\(\)\.getFullYear\(\)\}/, "")), (all.match(/\b\d+\s*(days?|weeks?|months?|years?)\b/i) ?? [""])[0]);
check("demo@ is never a contact on the legal pages", !/demo@/.test(all));
check("no certification or universal-compliance claim", !/\b(GDPR|HIPAA|ISO ?27001|SOC ?2)\b|fully compliant|complies with all/i.test(all));
check("no claim that NevOut never processes health information", !/never (process|store|collect)\w* (any )?health/i.test(all));
const src = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|jsx?|html)$/.test(e.name)) src.push(fs.readFileSync(p, "utf8")); } })(path.join(ROOT, "client/src"));
const code = src.join("\n") + read("client/index.html");
check("demo@nevoutmeds.com appears nowhere in the client (it is the demo login identity only)", !/demo@nevoutmeds\.com/i.test(code));
const home = read("client/src/pages/HomePage.tsx");
check("home page demo/general contact is hello@nevoutmeds.com", /PUBLIC_CONTACTS\.hello/.test(home) && /demoRequestMailto\(/.test(home) && !/demo@/.test(home));
const contacts = read("client/src/platform/support/publicContacts.ts");
check("published contacts are exactly hello, support, privacy, security, partnerships", ["hello", "support", "privacy", "security", "partnerships"].every((k) => new RegExp(`${k}: "${k}@nevoutmeds\\.com"`).test(contacts)) && !/demo@/.test(contacts));
check("privacy notice and terms list hello@ for general inquiries", /<Mail to="hello" \/>/.test(privacy) && /<Mail to="hello" \/>/.test(terms));
const outfile = path.join(ROOT, "node_modules/.cache/nv-legal-test/publicContacts.mjs");
await build({ entryPoints: [path.join(ROOT, "client/src/platform/support/publicContacts.ts")], bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "error" });
const { demoRequestMailto } = await import(pathToFileURL(outfile).href);
const href = demoRequestMailto({ name: " Ama ", phone: "+255 700 000 000", pharmacy: "Uhuru Pharmacy", message: "Expiry & stockouts?" });
const u = new URL(href);
check("demo request opens an email to hello@nevoutmeds.com", u.protocol === "mailto:" && u.pathname === "hello@nevoutmeds.com", href.slice(0, 40));
check("demo request subject and body are encoded and trimmed", u.searchParams.get("subject") === "Demo request: Uhuru Pharmacy" && u.searchParams.get("body") === "Name: Ama\nPhone / WhatsApp: +255 700 000 000\nPharmacy: Uhuru Pharmacy\n\nExpiry & stockouts?");
check("demo request without a pharmacy name still has a subject", new URL(demoRequestMailto({ name: "A" })).searchParams.get("subject") === "Demo request: pharmacy");
check("no tracker or analytics SDK in the client", !/gtag\(|googletagmanager|google-analytics|connect\.facebook\.net|hotjar|mixpanel|posthog|plausible\.io|clarity\.ms/i.test(code));
check("no cookie banner / consent manager and no cookie writes", !/CookieConsent|cookie[- ]?banner|consent[- ]?banner/i.test(code) && !/document\.cookie\s*=/.test(code));
check("no internal privacy documents on this branch", !fs.existsSync(path.join(ROOT, "docs/privacy")));

console.log(`\n# ${n} legal-page checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
