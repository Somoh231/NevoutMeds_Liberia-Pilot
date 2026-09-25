// NevOut Meds — two-step verification in the real app (Phase 11), LOCAL stack.
// Usage: APP_BASE=http://127.0.0.1:4180 CHROME=<path> UDD=<dir> OUT=<dir> node supabase/tests/ui_mfa.e2e.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { API, ANON, IDS, apiLogin, browser, reporter, sleep } from "./lib/harness.mjs";
import { enrollMfaInPage, passwordSession, secretFor, totp } from "./lib/mfa.mjs";

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const OUT = process.env.OUT || "/tmp/nv-ui-mfa";
fs.mkdirSync(`${OUT}/shots`, { recursive: true });
const SERVICE = fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim();
const { check, done } = reporter();
const b = await browser({ port: 9402, out: OUT });

const typeCode = async (code) => {
  await b.ev(`(() => { const i = document.querySelector('input[autocomplete="one-time-code"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ${JSON.stringify(code)}); i.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`);
  await sleep(200);
  await b.ev(`document.querySelector('input[autocomplete="one-time-code"]').closest('form').requestSubmit(), 1`);
};
const passwordOnly = async (email) => {
  await b.go("/login", 2500);
  await b.click(`document.querySelector('input[type=email]')`); await b.type(email);
  await b.click(`document.querySelector('input[type=password]')`); await b.type(IDS.password);
  await b.press("Enter");
  await b.waitFor(`location.pathname === '/platform'`, 12000);
};
const axeSerious = async () => {
  await b.ev(`window.axe ? 1 : (function(){ ${AXE}; return 1; })()`);
  const r = await b.ev(`(async () => JSON.stringify((await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21aa","wcag22aa"] }, resultTypes: ["violations"] })).violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => v.id + ":" + v.nodes.length)))()`);
  return JSON.parse(r ?? "[]");
};
const pan = () => b.ev(`Math.max(0, document.documentElement.scrollWidth - window.innerWidth)`);
const tinyText = () => b.ev(`[...document.querySelectorAll('body *')].filter(e => e.childElementCount === 0 && e.textContent.trim() && e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) < 12).length`);

// ── 1. Owner: the code screen ────────────────────────────────────────────────
await b.viewport("360");
await b.reset();
await passwordOnly("ownerA@e2e.local");
const gate = await b.waitFor(`!!document.querySelector('input[autocomplete="one-time-code"]')`, 10000);
check("owner: after the password, the code screen is shown (not the workspace)", gate && !(await b.ev(`!!document.querySelector('[data-nav-id]')`)), "");
check("the code field suits authenticator apps (numeric, one-time-code autofill, paste allowed)",
  await b.ev(`(() => { const i = document.querySelector('input[autocomplete="one-time-code"]'); return i.inputMode === 'numeric' && !i.onpaste; })()`), "");
check("the code screen has no serious accessibility issues (360 px)", (await axeSerious()).length === 0, JSON.stringify(await axeSerious()));
check("the code screen does not pan at 360 px", (await pan()) === 0, `${await pan()}px`);
await b.shot("mfa__challenge__360");

await typeCode("000000");
const wrongMsg = await b.waitFor(`/didn’t match/.test(document.body.innerText)`, 8000);
check("a wrong code says so plainly and keeps the person on the code screen", wrongMsg && !(await b.ev(`!!document.querySelector('[data-nav-id]')`)), "");
check("the error is announced to assistive technology", await b.ev(`!!document.querySelector('[aria-invalid="true"], [role="alert"]')`), "");

await b.go("/platform", 3500);
check("reloading during the second step keeps the code screen (no bypass)", await b.waitFor(`!!document.querySelector('input[autocomplete="one-time-code"]') && !document.querySelector('[data-nav-id]')`, 10000), "");

await b.offline(true);
await b.go("/platform", 3500);
// Emulated offline keeps navigator.onLine true after a reload, so check the outcome:
// either the screen says the code needs the internet, or trying a code says so.
let offlineMsg = await b.waitFor(`/must be checked online/.test(document.body.innerText)`, 4000);
if (!offlineMsg && (await b.ev(`!!document.querySelector('input[autocomplete="one-time-code"]')`))) {
  await typeCode(totp(secretFor("ownerA@e2e.local")));
  offlineMsg = await b.waitFor(`/offline|couldn’t check/i.test(document.body.innerText)`, 10000);
}
check("offline at the code step: it explains the code must be checked online, and stays locked", offlineMsg && !(await b.ev(`!!document.querySelector('[data-nav-id]')`)), "");
await b.offline(false);
await b.go("/platform", 3500);

await b.ev(`[...document.querySelectorAll('button')].find(x => /Lost your phone/.test(x.textContent))?.click(), 1`);
check("'Lost your phone?' explains the supervised recovery, with no self-service bypass", /pharmacy owner to reset|contact NevOut support/.test(await b.ev(`document.body.innerText`)) && !(await b.ev(`!![...document.querySelectorAll('button,a')].find(x => /skip|disable|turn off/i.test(x.textContent))`)), "");

await typeCode(totp(secretFor("ownerA@e2e.local")));
check("the right code opens the workspace", await b.waitFor(`!!document.querySelector('[data-nav-id]')`, 12000), "");

// ── 2. Owner: Account security ──────────────────────────────────────────────
for (const vp of ["360", "430", "tablet", "laptop"]) {
  await b.viewport(vp);
  await b.go("/platform", 3500);
  await b.ev(`document.querySelector('button[aria-label^="Account menu"]')?.click(), 1`); await sleep(400);
  await b.clickText("^Account security$"); await sleep(1500);
  const shown = await b.waitFor(`/Two-step verification/.test(document.querySelector('main')?.innerText ?? '')`, 8000);
  check(`Account security opens from the account menu (${vp})`, shown, "");
  check(`Account security: no sideways scroll (${vp})`, (await pan()) === 0, `${await pan()}px`);
  check(`Account security: no text under 12 px (${vp})`, (await tinyText()) === 0, `${await tinyText()}`);
  const a = await axeSerious();
  check(`Account security: no serious accessibility issues (${vp})`, a.length === 0, JSON.stringify(a));
  await b.shot(`mfa__security-owner__${vp}`);
}
const ownerText = await b.ev(`document.querySelector('main').innerText`);
check("owner sees MFA as on and required", /On · required/.test(ownerText), "");
check("owner cannot remove their only authenticator (Replace is offered instead)", !(await b.ev(`!![...document.querySelectorAll('main button')].find(x => x.textContent.trim() === 'Remove')`)) && (await b.ev(`!![...document.querySelectorAll('main button')].find(x => x.textContent.trim() === 'Replace')`)), "");
check("the pharmacy's security activity is listed without codes or keys", /Security activity in your pharmacy/.test(ownerText) && !/otpauth|[A-Z2-7]{24,}/.test(ownerText), "");

// ── 3. Staff: optional MFA, opt in through Account security ─────────────────
await b.viewport("430");
await b.reset();
await b.signIn("staffA@e2e.local");
check("staff without a factor go straight to the workspace", await b.ev(`!!document.querySelector('[data-nav-id]')`), "");
await b.ev(`document.querySelector('button[aria-label^="Account menu"]')?.click(), 1`); await sleep(400);
await b.clickText("^Account security$"); await sleep(1500);
check("staff see MFA as optional and off", /Optional for your role/.test(await b.ev(`document.querySelector('main').innerText`)) && /\bOff\b/.test(await b.ev(`document.querySelector('main').innerText`)), "");
await b.clickText("^Set up authenticator$"); await sleep(1500);
check("setup shows a QR code and a manual key (numbered steps)", await b.waitFor(`!!document.querySelector('.nv-totp__qr') && !!document.querySelector('.nv-totp__key') && document.querySelectorAll('.nv-totp__step').length === 3`, 10000), "");
check("setup dialog: no serious accessibility issues", (await axeSerious()).length === 0, JSON.stringify(await axeSerious()));
await b.shot("mfa__setup-dialog__430");
const staffSecret = await enrollMfaInPage(b.ev);
check("staff confirm their first code and MFA turns on", !!staffSecret && await b.waitFor(`/\\bOn\\b/.test(document.querySelector('main').innerText)`, 10000), "");
check("the key is no longer shown after setup", !(await b.ev(`!!document.querySelector('.nv-totp__key')`)), "");

await b.reset();
await b.go("/login", 2500);
await b.click(`document.querySelector('input[type=email]')`); await b.type("staffA@e2e.local");
await b.click(`document.querySelector('input[type=password]')`); await b.type(IDS.password);
await b.press("Enter");
check("after opting in, staff are asked for the code at sign-in", await b.waitFor(`!!document.querySelector('input[autocomplete="one-time-code"]')`, 12000), "");
await b.ev(`document.querySelector('input[autocomplete="one-time-code"]').focus(), 1`);
await b.type(totp(staffSecret));
await b.press("Enter");
check("keyboard only: typing the code and pressing Enter signs in", await b.waitFor(`!!document.querySelector('[data-nav-id]')`, 12000), "");

// Staff may remove their own (optional) authenticator.
await b.ev(`document.querySelector('button[aria-label^="Account menu"]')?.click(), 1`); await sleep(400);
await b.clickText("^Account security$"); await sleep(1500);
await b.ev(`[...document.querySelectorAll('main button')].find(x => x.textContent.trim() === 'Remove')?.click(), 1`); await sleep(600);
await b.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent.trim() === 'Remove')?.click(), 1`);
check("staff can remove their optional authenticator", await b.waitFor(`/\\bOff\\b/.test(document.querySelector('main').innerText)`, 10000), "");

// ── 4. Owner resets a staff member's authenticator from Staff ───────────────
// Staff opt in again through the API, then the owner resets it in the UI.
{
  const s = await passwordSession(API, ANON, "staffA@e2e.local", IDS.password);
  const e = await fetch(`${API}/auth/v1/factors`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ factor_type: "totp", friendly_name: "ui reset" }) }).then((r) => r.json());
  const ch = await fetch(`${API}/auth/v1/factors/${e.id}/challenge`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json());
  await fetch(`${API}/auth/v1/factors/${e.id}/verify`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ challenge_id: ch.id, code: totp(e.totp.secret) }) });
}
await b.viewport("laptop");
await b.reset();
await b.signIn("ownerA@e2e.local");
await b.open("staff"); await sleep(1500);
await b.ev(`(() => { const card = [...document.querySelectorAll('.nv-member')].find(c => /Staff A/.test(c.textContent)); [...card.querySelectorAll('button')].find(x => /Reset two-step/.test(x.textContent)).click(); return 1; })()`);
await sleep(600);
check("resetting asks the owner to confirm identity first", /confirmed, in person or by a call you placed yourself/.test(await b.ev(`document.querySelector('dialog[open]')?.innerText ?? ''`)), "");
await b.ev(`[...document.querySelectorAll('dialog[open] button')].find(x => x.textContent.trim() === 'Reset')?.click(), 1`);
await sleep(3500);
const factors = await fetch(`${API}/auth/v1/admin/users/${IDS.staffA}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).then((r) => r.json()).then((u) => (u.factors ?? []).filter((f) => f.status === "verified"));
check("the owner's reset removes the staff member's authenticator", factors.length === 0, `${factors.length} left`);
await b.ev(`document.querySelector('button[aria-label^="Account menu"]')?.click(), 1`); await sleep(400);
await b.clickText("^Account security$"); await sleep(2000);
check("the reset shows in the pharmacy's security activity", /had two-step verification reset by the pharmacy owner/.test(await b.ev(`document.querySelector('main').innerText`)), "");

// ── 5. A client cannot fake its way past the gate ──────────────────────────
await b.reset();
await passwordOnly("ownerA@e2e.local");
await b.waitFor(`!!document.querySelector('input[autocomplete="one-time-code"]')`, 10000);
const stored = await b.ev(`JSON.stringify(Object.keys(localStorage))`);
check("no 'MFA passed' flag is stored by the app (only Supabase's own session)", !/mfa|verified|aal/i.test(stored), stored);
// Try to reach data with the aal1 session the browser holds.
const tok = await b.ev(`(() => { const k = Object.keys(localStorage).find(k => k.includes('auth-token')); return JSON.parse(localStorage.getItem(k)).access_token; })()`);
const leaked = await fetch(`${API}/rest/v1/customers?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${tok}` } }).then((r) => r.json());
check("the browser's aal1 token reaches no pharmacy data even if the gate were bypassed", Array.isArray(leaked) && leaked.length === 0, JSON.stringify(leaked).slice(0, 80));

b.close();
process.exit(done("two-step verification UI checks") ? 1 : 0);
