// NevOut Meds — Tanzania country support (0021) through the real onboarding UI,
// on the LOCAL stack with a synthetic owner: Tanzania is offered, selecting it
// shows TZS, Dar es Salaam business days and the +255 phone format, and the
// pharmacy the server creates is TZ / TZS / Africa/Dar_es_Salaam / en-TZ.
//
// LOCAL ONLY. Needs the app served on an allowed redirect origin (default
// http://127.0.0.1:5173, the local auth allow-list).
// Usage: APP_BASE=http://127.0.0.1:5173 CHROME=… UDD=… OUT=… node supabase/tests/ui_country_tanzania.e2e.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANON, API, BASE, api, browser, reporter, sleep } from "./lib/harness.mjs";
import { enrollMfaInPage, passwordSession, verifyTotp } from "./lib/mfa.mjs";

if (!/127\.0\.0\.1|localhost/.test(API)) { console.error("local stack only"); process.exit(2); }
const { check, done } = reporter();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const keyFile = path.join(fs.mkdtempSync("/tmp/nv-tz-"), "key");
fs.writeFileSync(keyFile, fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim(), { mode: 0o600 });
const env = { ...process.env, NEVOUT_SUPABASE_URL: API, NEVOUT_SERVICE_ROLE_KEY_FILE: keyFile };
const email = `tanzania${Date.now()}@e2e.local`;
const out = execFileSync("node", [path.join(ROOT, "ops/provision/provision-owner.mjs"), "--email", email, "--name", "Tanzania Pilot Owner", "--app-url", BASE, "--yes"], { env, encoding: "utf8" });
const link = (out.match(/https?:\/\/\S+\/verify\S+/) ?? [])[0];

const b = await browser({ port: 9471, out: process.env.OUT });
await b.reset();
await b.viewport("390");
await b.go(link, 5000);
await b.waitFor(`!!document.querySelector('input[type=password]')`, 8000);
const pw = `Owner-${Date.now()}-pass`;
const fields = await b.ev(`document.querySelectorAll('input[type=password]').length`);
await b.click(`document.querySelectorAll('input[type=password]')[0]`); await b.type(pw);
if (fields > 1) { await b.click(`document.querySelectorAll('input[type=password]')[1]`); await b.type(pw); }
await b.press("Enter");
await b.waitFor(`/You’re all set|Password updated/.test(document.body.innerText)`, 10000);
await b.clickText("^Open your workspace$");
await b.waitFor(`location.pathname === '/onboarding'`, 10000);

const options = await b.ev(`JSON.stringify([...document.querySelectorAll('select[data-field="country"] option')].map((o) => [o.value, o.textContent.trim()]).filter(([v]) => v))`);
check("TZ1 onboarding offers Tanzania alongside the existing seven countries",
  options === JSON.stringify([["LR", "Liberia"], ["SL", "Sierra Leone"], ["GH", "Ghana"], ["NG", "Nigeria"], ["GM", "The Gambia"], ["KE", "Kenya"], ["RW", "Rwanda"], ["TZ", "Tanzania"]]), options);
await b.ev(`(() => { const s = document.querySelector('select[data-field="country"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'TZ'); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
await sleep(400);
const form = await b.ev(`document.querySelector('main')?.innerText ?? document.body.innerText`);
check("TZ2 selecting Tanzania shows Tanzanian shillings (TSh)", /Tanzanian shilling \(TSh\)/.test(form), (form.match(/Currency[^\n]*\n?[^\n]*/) ?? [""])[0]);
check("TZ3 the business day is Dar es Salaam time (every underscore shown as a space)", /Africa\/Dar es Salaam time/.test(form) && !/Dar_es/.test(form), (form.match(/Business day[^\n]*\n?[^\n]*/) ?? [""])[0]);
const placeholder = await b.ev(`document.querySelector('input[type=tel]')?.placeholder ?? ''`);
check("TZ4 the phone field shows the Tanzanian national format", placeholder === "0712 012 345", placeholder);

await b.fill(`document.querySelector('input[autocomplete="organization"]')`, "Synthetic Dar Pilot Pharmacy");
await b.fill(`document.querySelector('input[type=tel]')`, "0712 012 345");
await b.clickText("Create pharmacy workspace");
await b.waitFor(`location.pathname === '/platform'`, 15000);
const setupShown = await b.waitFor(`!!document.querySelector('.nv-totp__key') && !document.querySelector('[data-nav-id]')`, 15000);
check("TZ5 the Tanzanian pharmacy is created; the owner must set up two-step verification first", setupShown, setupShown ? "setup screen" : (await b.mainText()).slice(0, 120));
const secret = await enrollMfaInPage(b.ev);
const inWorkspace = await b.waitFor(`!!document.querySelector('[data-nav-id]')`, 15000);
await sleep(1500);
const shown = await b.mainText();
check("TZ6 the workspace opens and money is shown in TSh", inWorkspace && /TSh/.test(shown) && !/US\$/.test(shown), (shown.match(/[^\n]*TSh[^\n]*/) ?? ["no TSh"])[0].slice(0, 80));
b.close();

const s1 = await passwordSession(API, ANON, email, pw);
const factor = (s1.user?.factors ?? []).find((f) => f.status === "verified");
const s2 = factor && secret ? (await verifyTotp(API, ANON, s1.access_token, factor.id, secret)).session : null;
const owner = api(s2?.access_token);
const ph = await owner.rest(`pharmacies?select=id,name,country_code,country,default_currency,timezone,locale,phone`);
check("TZ7 the server created TZ / TZS / Africa/Dar_es_Salaam / en-TZ with an E.164 +255 phone",
  ph?.length === 1 && ph[0].country_code === "TZ" && ph[0].country === "Tanzania" && ph[0].default_currency === "TZS"
    && ph[0].timezone === "Africa/Dar_es_Salaam" && ph[0].locale === "en-TZ" && ph[0].phone === "+255712012345", JSON.stringify(ph?.[0] ?? ph));
const ctx = await owner.rpc("pharmacy_country_context", {});
check("TZ8 the country context reports the Dar es Salaam business date",
  ctx.body?.country_code === "TZ" && ctx.body?.timezone === "Africa/Dar_es_Salaam"
    && ctx.body?.business_date === new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam" }).format(new Date()), JSON.stringify(ctx.body).slice(0, 160));
check("TZ9 the Tanzanian owner sees no other tenant", (await owner.rest(`pharmacies?select=id`))?.length === 1 && ((await owner.rest(`customers?select=id`)) ?? []).length === 0);
fs.rmSync(path.dirname(keyFile), { recursive: true, force: true });
process.exit(done("Tanzania onboarding checks") ? 1 : 0);
