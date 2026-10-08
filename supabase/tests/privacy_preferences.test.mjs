// NevOut Meds — Privacy & Cookie Preferences (static checks + unit tests; no browser, no DB).
//
// Guards the rules for the first-visit notice and the preferences panel: the stored record is
// versioned and holds no identity; storage failures never throw; there is no Accept/Reject choice,
// no fake toggle, no tracker, no cookie write and no new third-party script or dependency; the
// notice stays off sign-in and workspace screens and nothing in the app waits on it; and the
// panel stays about browser storage only.
//
// Usage: node supabase/tests/privacy_preferences.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let n = 0, failed = 0;
const check = (d, ok, detail = "") => { n++; if (!ok) failed++; console.log(`${ok ? "ok" : "not ok"} ${n} - ${d}${detail ? ` [${detail}]` : ""}`); };
const flat = (s) => s.replace(/\s+/g, " ");

// ── Unit: the preference record ────────────────────────────────────────────────
const outfile = path.join(ROOT, "node_modules/.cache/nv-privacy-test/preferences.mjs");
await build({ entryPoints: [path.join(ROOT, "client/src/platform/privacy/preferences.ts")], bundle: true, format: "esm", platform: "neutral", outfile, logLevel: "error" });
const P = await import(pathToFileURL(outfile).href);
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

let s = mem();
check("a first visit needs the notice", P.needsNotice(s) === true && P.readPrefs(s) === null);
check("saving the acknowledgment succeeds", P.saveAcknowledgment(s, new Date("2026-10-08T12:00:00Z")) === true);
check("after acknowledging, the notice is not needed", P.needsNotice(s) === false);
const rec = JSON.parse(s.m.get(P.PREFS_KEY));
check("record is exactly { version, acknowledged, optionalAnalytics, updatedAt }", JSON.stringify(Object.keys(rec).sort()) === JSON.stringify(["acknowledged", "optionalAnalytics", "updatedAt", "version"]), JSON.stringify(rec));
check("record values: current version, acknowledged, analytics off, ISO timestamp", rec.version === P.PREFS_VERSION && rec.acknowledged === true && rec.optionalAnalytics === false && rec.updatedAt === "2026-10-08T12:00:00.000Z");
check("storage key is first-party and descriptive", P.PREFS_KEY === "nevoutmeds_privacy_prefs");
s = mem(); s.setItem(P.PREFS_KEY, JSON.stringify({ ...rec, version: P.PREFS_VERSION - 1 }));
check("an older preference version shows the notice again", P.needsNotice(s) === true);
s = mem(); s.setItem(P.PREFS_KEY, JSON.stringify({ ...rec, version: P.PREFS_VERSION + 1 }));
check("a newer record (another tab already upgraded) does not nag", P.needsNotice(s) === false);
for (const [label, raw] of [["unreadable JSON", "{oops"], ["acknowledged false", JSON.stringify({ ...rec, acknowledged: false })], ["missing version", JSON.stringify({ acknowledged: true, updatedAt: "x" })], ["null", "null"], ["a string", JSON.stringify("yes")]]) {
  s = mem(); s.setItem(P.PREFS_KEY, raw);
  check(`a malformed record (${label}) is ignored and the notice shown`, P.readPrefs(s) === null && P.needsNotice(s) === true);
}
s = mem(); s.setItem(P.PREFS_KEY, JSON.stringify({ ...rec, optionalAnalytics: true, email: "x@y.z" }));
check("reading never turns optional analytics on or carries extra fields", JSON.stringify(P.readPrefs(s)) === JSON.stringify({ version: rec.version, acknowledged: true, optionalAnalytics: false, updatedAt: rec.updatedAt }));
const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
check("blocked storage: reading does not throw and shows the notice", P.needsNotice(throwing) === true);
check("blocked storage: saving returns false instead of throwing", P.saveAcknowledgment(throwing) === false);
check("no storage at all: notice shown, save returns false", P.needsNotice(null) === true && P.saveAcknowledgment(null) === false);

// ── Static: what the code may and may not do ────────────────────────────────────
const prefsSrc = read("client/src/platform/privacy/preferences.ts");
const ui = read("client/src/platform/privacy/PrivacyPreferences.tsx");
const css = read("client/src/platform/privacy/privacy.css");
const app = read("client/src/App.tsx");
check("preference module imports nothing (no auth, user, pharmacy or network access)", !/^import /m.test(prefsSrc));
check("panel imports no auth, data, database or network module", !/useAuth|supabase|apiClient|platform\/(db|data|api|offline|auth)\b|fetch\(/.test(ui));
check("record type holds no identity fields", !/(userId|user_id|email|pharmacy|account|phone|name)\s*[:?]/i.test(prefsSrc.slice(prefsSrc.indexOf("export type PrivacyPrefs"), prefsSrc.indexOf("};", prefsSrc.indexOf("export type PrivacyPrefs")))));
check("mounted once in App, outside the routes (it gates nothing)", (app.match(/<PrivacyPreferences \/>/g) ?? []).length === 1 && app.indexOf("<PrivacyPreferences />") > app.indexOf("</Routes>"));
const users = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(e.name) && /needsNotice|readPrefs/.test(fs.readFileSync(p, "utf8"))) users.push(path.relative(ROOT, p)); } })(path.join(ROOT, "client/src"));
check("only the privacy module reads the record (sign-in, data and offline code never wait on it)", users.every((p) => p.startsWith("client/src/platform/privacy/")), users.join(","));
const routes = ui.match(/NOTICE_ROUTES = new Set\(\[([^\]]*)\]\)/)?.[1] ?? "";
check("notice is limited to the public site: /, /privacy, /terms, /cookies", routes.replace(/\s/g, "") === `"/","/privacy","/terms","/cookies"`, routes);
check("notice never shows on sign-in, verification, password or workspace routes", !/\/login|\/platform|\/admin|\/import|\/onboarding|\/accept-invite|password/.test(routes));
check("notice copy is as approved", flat(ui).includes("NevOut uses essential browser storage and related technologies to keep the service secure, support sign-in, and enable offline functionality. We do not use advertising trackers."));
check("notice actions are 'Got it' and 'Manage preferences'", />Got it</.test(ui) && />Manage preferences</.test(ui));
check("panel title and intro are as approved", ui.includes(`title="Privacy & Cookie Preferences"`) && ui.includes("NevOut uses limited browser storage and related technologies to provide secure sign-in, offline functionality, synchronization, and core application features. We currently do not use advertising or behavioral tracking technologies."));
check("Essential is 'Always active' with no toggle", /Essential<\/h3>[\s\S]{0,200}Always active/.test(ui) && !/<Switch|<Checkbox|type="checkbox"|role="switch"|<input/.test(ui));
check("optional analytics is 'Not currently used' and informational only", /Optional analytics<\/h4>[\s\S]{0,200}Not currently used/.test(ui) && flat(ui).includes("NevOut does not currently use optional analytics or behavioral tracking technologies."));
check("advertising is 'Not used'", /Advertising &amp; marketing<\/h4>[\s\S]{0,200}>Not used</.test(ui));
check("actions are 'Save preferences' and 'Close'", />Save preferences</.test(ui) && />Close</.test(ui));
check("panel links /privacy, /cookies, /terms", ['to="/privacy"', 'to="/cookies"', 'to="/terms"'].every((t) => ui.includes(t)));
check("panel does not mix in customer consent, health data or Business Performance", !/consent|health|Business Performance|allerg|prescri|lender|credit/i.test(ui));
check("reduced motion is respected", /prefers-reduced-motion/.test(css));
check("phone touch targets are 44 px", /min-height: 44px/.test(css));

// Entry points
check("home footer reopens the panel", /<PrivacyPreferencesLink \/>/.test(read("client/src/pages/HomePage.tsx")));
check("legal-page footer reopens the panel", /<LegalLinks preferences \/>/.test(read("client/src/pages/legal/LegalLayout.tsx")));
check("signed-in Help & feedback reopens the panel", /<LegalLinks [^>]*preferences \/>/.test(read("client/src/pages/PlatformPage.tsx")));
check("sign-in screens keep their plain legal links (no extra entry)", /<LegalLinks \/>/.test(read("client/src/platform/auth/AuthLayout.tsx")));
check("'Cookies' keeps its name and route", /\{ to: "\/cookies", label: "Cookies" \}/.test(read("client/src/platform/legal/LegalLinks.tsx")));
const cookies = read("client/src/pages/legal/CookiesPage.tsx");
check("Cookies notice lists the preference record and how to reopen the panel", cookies.includes("Privacy preferences (browser local storage)") && /<PrivacyPreferencesLink \/>/.test(cookies));
check("Cookies notice future-change sentence is unchanged", flat(cookies).includes("If NevOut later introduces optional analytics, advertising, or other non-essential tracking technologies, this notice and any required choices or consent controls will be updated before those technologies are used."));

// Nothing tracking-related was introduced
const src = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|jsx?|css|html)$/.test(e.name)) src.push(fs.readFileSync(p, "utf8")); } })(path.join(ROOT, "client/src"));
const code = src.join("\n") + read("client/index.html");
check("no 'Accept all' / 'Reject all' anywhere in the client", !/accept all|reject all/i.test(code));
check("no advertising or analytics tracker in the client", !/gtag\(|googletagmanager|google-analytics|connect\.facebook\.net|fbq\(|hotjar|mixpanel|posthog|plausible\.io|clarity\.ms|segment\.(io|com)|amplitude|heap(analytics)?\.|fullstory|logrocket|smartlook|matomo|doubleclick|adsbygoogle/i.test(code));
check("no cookie writes and no consent-manager library", !/document\.cookie\s*=/.test(code) && !/cookieconsent|onetrust|cookiebot|cookieyes|osano|iubenda|termly|klaro/i.test(code));
const html = read("client/index.html");
check("index.html loads no third-party script", [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].every((m) => m[1].startsWith("/")), [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]).join(","));
const pkg = JSON.parse(read("package.json"));
const deps = Object.keys(pkg.dependencies).sort().join(",");
check("no new runtime dependency (no consent or tracking package)", deps === "@sentry/react,@supabase/supabase-js,@tanstack/react-query,lucide-react,papaparse,react,react-dom,react-router-dom,xlsx", deps);
check("no internal privacy documents on this branch", !fs.existsSync(path.join(ROOT, "docs/privacy")));

console.log(`\n# ${n} privacy-preference checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
