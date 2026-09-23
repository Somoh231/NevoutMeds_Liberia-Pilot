// NevOut Meds — pilot owner-provisioning fallback (ops/provision/provision-owner.mjs)
// end to end on the LOCAL stack: operator creates the account without a
// password → single-use setup link → owner sets their own password → normal
// onboarding creates the pharmacy. Also checks the script's refusals.
//
// LOCAL ONLY. Needs the app served on an allowed redirect origin (default
// http://127.0.0.1:5173, the local auth allow-list).
// Usage: APP_BASE=http://127.0.0.1:5173 NEVOUT_API_URL=http://127.0.0.1:55421 CHROME=… UDD=… OUT=… node supabase/tests/ui_owner_provisioning.e2e.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API, BASE, api, apiLogin, browser, reporter, sleep } from "./lib/harness.mjs";

if (!/127\.0\.0\.1|localhost/.test(API)) { console.error("local stack only"); process.exit(2); }
const { check, done } = reporter();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const keyFile = path.join(fs.mkdtempSync("/tmp/nv-prov-"), "key");
fs.writeFileSync(keyFile, fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim(), { mode: 0o600 });
const env = { ...process.env, NEVOUT_SUPABASE_URL: API, NEVOUT_SERVICE_ROLE_KEY_FILE: keyFile };
const email = `provisioned${Date.now()}@e2e.local`;
const run = (...a) => { try { return { code: 0, out: execFileSync("node", [path.join(ROOT, "ops/provision/provision-owner.mjs"), ...a], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; } };

// Without --yes nothing happens.
const dry = run("--email", email, "--name", "Pilot Owner", "--app-url", BASE);
check("P1 without --yes the script only explains and changes nothing", dry.code === 0 && /Re-run with --yes/.test(dry.out) && !/https?:\/\/\S+verify/.test(dry.out), dry.out.split("\n")[0]);

const res = run("--email", email, "--name", "Pilot Owner", "--app-url", BASE, "--yes");
const link = (res.out.match(/https?:\/\/\S+\/verify\S+/) ?? [])[0];
check("P2 the operator gets a single-use setup link, and no password is involved", res.code === 0 && !!link && !/password:/i.test(res.out), link ? "link issued" : res.out.slice(0, 160));

const again = run("--email", email, "--name", "Pilot Owner", "--app-url", BASE, "--yes");
check("P3 an existing account cannot be provisioned twice", again.code === 1 && /already exists/.test(again.out), again.out.split("\n")[0]);

const b = await browser({ port: 9470, out: process.env.OUT });
await b.reset();
await b.viewport("390");
await b.go(link, 5000);
const onReset = (await b.ev(`location.pathname`)) === "/reset-password" && (await b.waitFor(`!!document.querySelector('input[type=password]')`, 8000));
check("P4 the link opens the password page already signed in", onReset, await b.ev(`location.pathname`));
const pw = `Owner-${Date.now()}-pass`;
const fields = await b.ev(`document.querySelectorAll('input[type=password]').length`);
await b.click(`document.querySelectorAll('input[type=password]')[0]`); await b.type(pw);
if (fields > 1) { await b.click(`document.querySelectorAll('input[type=password]')[1]`); await b.type(pw); }
await b.press("Enter");
const set = await b.waitFor(`/You’re all set|Password updated/.test(document.body.innerText)`, 10000);
check("P5 the owner chooses their own password", set, set ? "password set" : (await b.mainText()).slice(0, 120));
await b.clickText("^Open your workspace$");
await b.waitFor(`location.pathname === '/onboarding'`, 10000);
check("P6 with no pharmacy yet, the owner lands on onboarding", (await b.ev(`location.pathname`)) === "/onboarding", await b.ev(`location.pathname`));
await b.ev(`(() => { const s = document.querySelector('select[data-field="country"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'LR'); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
await sleep(400);
await b.fill(`document.querySelector('input[autocomplete="organization"]')`, "Provisioned Pilot Pharmacy");
await b.clickText("Create pharmacy workspace");
await b.waitFor(`location.pathname === '/platform'`, 15000);
check("P7 onboarding creates the pharmacy and opens the workspace", (await b.ev(`location.pathname`)) === "/platform", await b.ev(`location.pathname`));
b.close();

const owner = api(await apiLogin(email, pw));
const ph = await owner.rest(`pharmacies?select=name,country_code,default_currency`);
const prof = await owner.rest(`users_profiles?select=role`);
check("P8 the server has the owner and a Liberian pharmacy", ph?.[0]?.name === "Provisioned Pilot Pharmacy" && ph?.[0]?.country_code === "LR" && prof?.[0]?.role === "owner", JSON.stringify({ ph, prof }));
const later = run("--email", email, "--app-url", BASE, "--new-link", "--yes");
check("P9 no new setup link is issued for an account that is already in use", later.code === 1 && /already signed in or belongs to a pharmacy/.test(later.out), later.out.split("\n")[0]);
const log = fs.readFileSync(path.join(ROOT, "ops/provision/provision.log"), "utf8");
check("P10 every action is audited locally, without the link", log.includes(email) && /setup_link_issued/.test(log) && !/verify\?token|access_token/.test(log), "provision.log");
fs.rmSync(path.dirname(keyFile), { recursive: true, force: true });
process.exit(done("owner provisioning checks") ? 1 : 0);
