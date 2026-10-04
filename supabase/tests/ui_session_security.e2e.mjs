// NevOut Meds — session security in the real app (final security audit, SA-05 / SA-06).
//
// LOCAL STACK ONLY, synthetic seeded accounts. Needs the app served on an allowed
// redirect origin (default http://127.0.0.1:5173, the local auth allow-list) so
// the real recovery and invitation email links can be followed.
//
//   S  offline sign-out (SA-06)
//     S-A owner signs in, goes offline, signs out: workspace, session and cached
//         customer data are gone from the device; the page says it was local only
//     S-B a reload while still offline does not restore the session
//     S-C another user signing in on the same device sees nothing of the previous tenant
//     S-D work queued before the offline sign-out stays isolated: it is not sent
//         under the next user's session and is applied only when its own user
//         signs in again (server-authorised replay)
//     S-E normal online sign-out still clears the device and revokes the refresh token
//   U  URL session swap (SA-05)
//     U-A/B/C a signed-in owner opening a crafted #access_token link on /platform,
//         / and other ordinary routes stays signed in as themselves
//     U-allowed the same link on an email-link route is refused with a notice
//     U-F data entered after opening the crafted link goes to the victim's own tenant
//     U-D signed out: a real recovery / setup link still lets the person set a password
//     U-E signed out: a real invitation email link still joins the invitee to the pharmacy
//
// Usage: APP_BASE=http://127.0.0.1:5173 NEVOUT_API_URL=http://127.0.0.1:55421 CHROME=… UDD=… OUT=… node supabase/tests/ui_session_security.e2e.mjs
import fs from "node:fs";
import { ANON, API, BASE, IDS, api, apiLogin, browser, reporter, sleep } from "./lib/harness.mjs";
import { passwordSession, signInFull } from "./lib/mfa.mjs";

if (!/127\.0\.0\.1|localhost/.test(API)) { console.error("local stack only"); process.exit(2); }
const { check, done } = reporter();
const SERVICE = fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim();
const KEY = `sb-${new URL(API).hostname.split(".")[0]}-auth-token`;
const ownerA = api(await apiLogin("ownerA@e2e.local"));
const ownerB = api(await apiLogin("ownerB@e2e.local"));
const phName = async (o, id) => ((await o.rest(`pharmacies?select=name&id=eq.${id}`)) ?? [])[0]?.name;
const nameA = await phName(ownerA, IDS.pharmacyA);
const nameB = await phName(ownerB, IDS.pharmacyB);
const customersOf = async (o) => ((await o.rest("customers?select=first_name,last_name,phone&limit=50")) ?? []);
const aNames = (await customersOf(ownerA)).map((c) => `${c.first_name} ${c.last_name}`).filter((n) => n.trim().length > 3);
const admin = (path, body) => fetch(`${API}/auth/v1/admin${path}`, { method: body ? "POST" : "GET", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

const b = await browser({ port: 9481, out: process.env.OUT });
const stored = async () => JSON.parse((await b.ev(`localStorage.getItem(${JSON.stringify(KEY)})`)) ?? "null");
const storedUser = async () => (await stored())?.user?.id ?? null;
const idb = () => b.ev(`(async () => { const db = await new Promise((res, rej) => { const o = indexedDB.open('nevoutmeds'); o.onsuccess = () => res(o.result); o.onerror = rej; });
  const all = (s) => new Promise((res) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); });
  return JSON.stringify({ cache: (await all('cache')).map((r) => r.key), meta: (await all('meta')).length, queue: (await all('queue')).map((q) => ({ t: q.tenant_key, s: q.status, p: q.payload?.p_phone })) }); })()`).then((s) => JSON.parse(s ?? "{}"));
async function signOutViaMenu() {
  await b.click(`document.querySelector('button[aria-label^="Account menu"]')`); await sleep(500);
  await b.clickText("^Sign out$"); await sleep(800);
  if (await b.ev(`!!document.querySelector('dialog[open]') && /hasn.t synced/.test(document.querySelector('dialog[open]').innerText)`)) {
    await b.clickText("^Sign out anyway$", "document.querySelector('dialog[open]')");
  }
  await sleep(2500);
}
async function registerCustomer(first, last, phone) {
  // In-app navigation only: a full page load would need the network (or the
  // service worker) and is not what a pharmacist does mid-shift.
  if ((await b.ev("location.pathname")) !== "/platform") await b.go("/platform", 3500);
  await b.open("customers");
  await b.clickText("^New customer$", "document.querySelector('main')"); await sleep(600);
  await b.fill(`document.querySelector('dialog[open] input[autocomplete="given-name"]')`, first);
  await b.fill(`document.querySelector('dialog[open] input[autocomplete="family-name"]')`, last);
  await b.fill(`document.querySelector('dialog[open] input[type=tel]')`, phone);
  await b.press("Enter"); await sleep(2500);
}
const serverHas = async (o, phone) => ((await o.rest(`customers?select=id&phone=eq.${encodeURIComponent(phone)}`)) ?? []).length === 1;

// ── S: offline sign-out ─────────────────────────────────────────────────────
await b.reset();
await b.viewport("laptop");
check("setup: owner A signs in", (await b.signIn("ownerA@e2e.local")) === "/platform");
check("setup: the offline app shell (service worker) controls the page", await b.waitFor("!!navigator.serviceWorker?.controller", 15000));
await b.open("customers"); await sleep(1500);
const screenA = await b.text();
const sawA = aNames.some((n) => screenA.includes(n));
check("setup: owner A's customers are on screen and cached for offline use", sawA && (await idb()).cache.length > 0, `${(await idb()).cache.length} cached`);

await b.offline(true);
const queuedPhone = `+23177${Date.now().toString().slice(-7)}`;
await registerCustomer("Queued", "Offline", queuedPhone);
const q1 = await idb();
check("S-D setup: a customer registered offline is queued on the device for owner A's tenant", q1.queue.some((q) => q.p === queuedPhone && q.t === `${IDS.pharmacyA}:${IDS.ownerA}` && q.s === "pending"), JSON.stringify(q1.queue.filter((q) => q.p === queuedPhone)));

await signOutViaMenu();
const afterOut = await b.text();
const dev1 = await idb();
check("S-A offline sign-out ends the session on the device (no stored session)", (await stored()) === null, KEY);
check("S-A the sign-in page is shown and says the sign-out was local only", /Sign in/.test(afterOut) && /Signed out on this device only/.test(afterOut), (await b.ev("location.pathname")));
check("S-A cached pharmacy data and profile snapshots are removed", dev1.cache.length === 0 && dev1.meta === 0, JSON.stringify({ cache: dev1.cache.length, meta: dev1.meta }));
check("S-A none of owner A's customers are visible", !aNames.some((n) => afterOut.includes(n)) && !afterOut.includes(nameA ?? "@@"), "");
await b.go("/platform", 3000);
check("S-A the workspace cannot be reopened (redirects to sign-in)", (await b.ev("location.pathname")) === "/login", await b.ev("location.pathname"));

await b.send("Page.reload", { ignoreCache: false }); await sleep(4000);
check("S-B a reload while still offline does not restore the session", (await stored()) === null && (await b.ev("location.pathname")) === "/login", await b.ev("location.pathname"));
check("S-D the queued work is kept on the device, still bound to owner A's tenant", (await idb()).queue.some((q) => q.p === queuedPhone && q.t.startsWith(`${IDS.pharmacyA}:`) && q.s === "pending"));

await b.offline(false);
check("S-C owner B signs in on the same device", (await b.signIn("ownerB@e2e.local")) === "/platform");
await b.open("customers"); await sleep(2500);
const bView = await b.text();
const dev2 = await idb();
check("S-C owner B sees none of owner A's customers or pharmacy", !aNames.some((n) => bView.includes(n)) && !bView.includes(nameA ?? "@@"), "");
check("S-C the device cache now holds only owner B's tenant", dev2.cache.length > 0 && dev2.cache.every((k) => k.startsWith(`${IDS.pharmacyB}:`)), dev2.cache.slice(0, 3).join(","));
await sleep(6000); // give the sync engine every chance to (wrongly) replay A's queue
check("S-D owner A's queued work was not sent under owner B's session", !(await serverHas(ownerA, queuedPhone)) && !(await serverHas(ownerB, queuedPhone)) && (await idb()).queue.some((q) => q.p === queuedPhone && q.s === "pending"));

const bRefresh = (await stored())?.refresh_token;
await signOutViaMenu();
const reuse = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: bRefresh }) });
const outText = await b.text();
check("S-E online sign-out clears the device and the server rejects the old refresh token", (await stored()) === null && (await idb()).cache.length === 0 && reuse.status >= 400, `refresh ${reuse.status}`);
check("S-E online sign-out does not show the 'local only' notice", !/Signed out on this device only/.test(outText));

const aAgain = await b.signIn("ownerA@e2e.local");
if (aAgain !== "/platform") { await b.shot("sd_signin_again"); console.log("DEBUG signin-again:", aAgain, await b.ev("location.href"), (await b.ev("document.body.innerText"))?.slice(0, 300)); }
check("S-D owner A signs in again online", aAgain === "/platform", aAgain);
let replayed = false;
for (let i = 0; i < 30 && !replayed; i++) { await sleep(1000); replayed = await serverHas(ownerA, queuedPhone); }
check("S-D the queued work is then applied for owner A's own pharmacy (server-authorised replay)", replayed && !(await serverHas(ownerB, queuedPhone)), queuedPhone);

// ── U: URL session swap ─────────────────────────────────────────────────────
const bTok = await signInFull(API, ANON, "ownerB@e2e.local", IDS.password);
const frag = `#access_token=${bTok.access_token}&refresh_token=${bTok.refresh_token}&expires_in=3600&expires_at=${Math.floor(Date.now() / 1000) + 3600}&token_type=bearer&type=magiclink`;
for (const [label, route] of [["U-A", "/platform"], ["U-B", "/"], ["U-C", "/admin"], ["U-C", "/import"], ["U-C", "/login"]]) {
  await b.go(`${route}${frag}`, 4500);
  const user = await storedUser();
  const t = await b.text();
  check(`${label} crafted access-token link on ${route}: owner A stays signed in as themselves`, user === IDS.ownerA && !t.includes(nameB ?? "@@"), `${user?.slice(0, 8)} on ${await b.ev("location.pathname")}`);
  check(`${label}   …and the attacker's token is removed from the address bar (${route})`, !(await b.ev(`location.href.includes('access_token')`)));
}
await b.go("/platform", 3500);
check("U-A after the crafted links the workspace is still owner A's pharmacy", (await b.text()).includes(nameA ?? "@@") && !(await b.text()).includes(nameB ?? "@@"), nameA);

for (const route of ["/reset-password", `/accept-invite?token=crafted`, "/onboarding"]) {
  await b.go(`${route}${frag}`, 4500);
  const t = await b.text();
  check(`U-allowed crafted link on email-link route ${route.split("?")[0]} is refused with a notice and no swap`, (await storedUser()) === IDS.ownerA && /Someone is already signed in/.test(t) && !(await b.ev(`!!document.querySelector('input[type=password]')`)), (await storedUser())?.slice(0, 8));
}

await b.go(`/platform${frag}`, 4000);
const fPhone = `+23188${Date.now().toString().slice(-7)}`;
await registerCustomer("Victim", "Entry", fPhone);
let inA = false;
for (let i = 0; i < 12 && !inA; i++) { await sleep(500); inA = await serverHas(ownerA, fPhone); }
check("U-F data entered after opening a crafted link lands in the victim's own pharmacy, never the attacker's", inA && !(await serverHas(ownerB, fPhone)), fPhone);
await signOutViaMenu();

// U-D: signed out, a real recovery / setup link still works.
await b.reset();
const recEmail = `recovery${Date.now()}@e2e.local`;
await admin("/users", { email: recEmail, password: `Old-${Date.now()}-pw`, email_confirm: true });
const rec = await admin("/generate_link", { type: "recovery", email: recEmail, redirect_to: `${BASE}/reset-password` });
await b.go(rec.action_link ?? rec.properties?.action_link, 5000);
const onReset = (await b.ev("location.pathname")) === "/reset-password" && (await b.waitFor(`!!document.querySelector('input[type=password]')`, 8000));
check("U-D signed out: the recovery / setup link opens the set-password page signed in", onReset, await b.ev("location.pathname"));
const newPw = `New-${Date.now()}-pass`;
await b.click(`document.querySelectorAll('input[type=password]')[0]`); await b.type(newPw);
await b.click(`document.querySelectorAll('input[type=password]')[1]`); await b.type(newPw);
await b.clickText("Save new password");
await b.waitFor(`/Password updated/.test(document.body.innerText)`, 10000);
const relogin = await passwordSession(API, ANON, recEmail, newPw).catch(() => null);
check("U-D the person can sign in with the password they chose", !!relogin?.access_token);

// U-E: signed out, a real invitation email link still works.
await b.reset();
const invEmail = `invitee${Date.now()}@e2e.local`;
const inv = await ownerA.rpc("invite_staff", { p_email: invEmail, p_name: "Link Invitee", p_role: "staff" });
const invLink = await admin("/generate_link", { type: "invite", email: invEmail, redirect_to: `${BASE}/accept-invite?token=${encodeURIComponent(inv.body?.token ?? "")}` });
await b.go(invLink.action_link ?? invLink.properties?.action_link, 6000);
let joined = false;
for (let i = 0; i < 20 && !joined; i++) { await sleep(700); joined = ((await ownerA.rest(`users_profiles?select=role,status&email=eq.${encodeURIComponent(invEmail)}`)) ?? []).some((p) => p.role === "staff" && p.status === "active"); }
check("U-E signed out: the invitation email link signs the invitee in and joins them to the pharmacy", inv.status === 200 && joined, `invite ${inv.status}`);

const failures = done("session-security UI checks");
b.close();
process.exit(failures ? 1 : 0);
