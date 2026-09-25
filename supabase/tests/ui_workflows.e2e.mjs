// Drives the real UI (production build) against the LOCAL Supabase stack and
// checks the Phase 3 workflows end to end: customer creation persists, the
// dashboard shows real values with today's date, and financials declare what is
// not tracked instead of inventing it.
//
// A session is injected into localStorage because GoTrue sign-in through the
// local Kong times out on this machine; the token is a normal signed JWT, so
// PostgREST applies the same RLS as it would for a real login.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { upgradeIfEnrolled } from "./lib/mfa.mjs";
import { completeMfaInPage } from "./lib/mfa.mjs";

const BASE = process.env.APP_BASE || "http://127.0.0.1:4178";
const SUPABASE = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tokens for the direct database assertions this test makes (the app itself
// signs in through its own form below).
async function apiToken(email) {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: IDS.password })
  });
  const b = await upgradeIfEnrolled(SUPABASE, ANON, email, await r.json());
  if (!b.access_token) throw new Error(`login failed for ${email}`);
  return b.access_token;
}
const accessToken = await apiToken("staffA@e2e.local");

const proc = spawn(process.env.CHROME, ["--remote-debugging-port=9336", `--user-data-dir=${process.env.UDD}`, "about:blank"], { stdio: "ignore" });
let list; for (let i = 0; i < 60; i++) { try { list = await (await fetch("http://127.0.0.1:9336/json/list")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else events.push(d); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable");

let pass = 0, fail = 0;
const check = (desc, ok, detail) => { if (ok) { pass++; console.log(`ok   ${desc}${detail ? ` [${detail}]` : ""}`); } else { fail++; console.log(`NOT OK ${desc} [${detail}]`); } };

// Sign in through the app's own form — no injected session.
const rectOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
async function clickAt(box) {
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(600);
}
async function signIn(email) {
  // Start from a clean session: /login redirects away when one already exists,
  // so switching accounts has to sign out first (also proves no tenant data
  // survives the switch).
  await send("Page.navigate", { url: `${BASE}/` });
  await sleep(1500);
  await ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} return 1; })()`);
  await send("Page.navigate", { url: `${BASE}/login` });
  await sleep(4000);
  const emailBox = await rectOf(`[...document.querySelectorAll('input')].find(i => /email/i.test(i.type + ' ' + (i.placeholder||'') + ' ' + (i.autocomplete||'')))`);
  if (emailBox) { await clickAt(emailBox); await send("Input.insertText", { text: email }); }
  const pwBox = await rectOf(`document.querySelector('input[type=password]')`);
  if (pwBox) { await clickAt(pwBox); await send("Input.insertText", { text: IDS.password }); }
  const btn = await rectOf(`[...document.querySelectorAll('button')].find(b => /Sign in|Log in|Continue/.test(b.textContent))`);
  if (btn) await clickAt(btn);
  await completeMfaInPage(ev, email);
  await sleep(7000);
}
await signIn("staffA@e2e.local");

const phone = `+2316${Date.now().toString().slice(-6)}`;
let info = await ev(`({path: location.pathname, text: document.body.innerText.slice(0, 400)})`);
check("signed-in user reaches the platform", info.path === "/platform", `path=${info.path}`);
// Phase 9: "today" is the pharmacy's business date (Africa/Monrovia), not the machine's.
const pharmacyToday = await ev(`new Date().toLocaleDateString("en-LR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Monrovia" })`);
check("dashboard shows today's real date, not a hard-coded one",
  info.text.includes(pharmacyToday),
  info.text.replace(/\n/g, " | ").slice(0, 120));
check("dashboard no longer shows the invented $240 / ↑12% figures",
  !info.text.includes("$240") && !info.text.includes("$240.00") && !info.text.includes("↑ 12%"), "checked KPI row");

// Customers screen: create a customer through the real form, using real
// trusted mouse/keyboard events (CDP Input domain), exactly like a user.
const clickText = async (pattern, tag = "button") => {
  const box = await ev(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(tag)})].find((e) => new RegExp(${JSON.stringify(pattern)}).test(e.textContent));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`);
  if (!box) return false;
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(700);
  return true;
};

const typeInto = async (placeholderFragment, value) => {
  const box = await ev(`(() => {
    const el = [...document.querySelectorAll('input')].find((i) => (i.placeholder || '').toLowerCase().includes(${JSON.stringify(placeholderFragment.toLowerCase())}));
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`);
  if (!box) return false;
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await send("Input.insertText", { text: value });
  await sleep(250);
  return true;
};

await clickText("Customers");
await sleep(2500);
const before = await ev(`document.body.innerText.match(/(\\d+) registered/)?.[1] ?? null`);
const opened = await clickText("Register Patient|New Customer|^New customer$");
await sleep(1200);
const fieldCount = await ev(`document.querySelectorAll('input').length`);
check("new-customer form opens", opened && fieldCount > 1, `inputs=${fieldCount}`);

// The name fields carry labels rather than placeholders, so target them by
// position within the open form (0 is the customer search box).
const typeIntoIndex = async (index, value) => {
  const box = await ev(`(() => {
    const el = document.querySelectorAll('input')[${index}];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  })()`);
  if (!box) return false;
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await send("Input.insertText", { text: value });
  await sleep(250);
  return true;
};

await typeIntoIndex(1, "Uiflow");
await typeIntoIndex(2, "Tester");
// Prefer the real phone field (type="tel"); placeholders are locale-specific.
const telBox = await ev(`(() => { const el = document.querySelector('dialog[open] input[type=tel]'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`);
let phoneFilled = false;
if (telBox) { const { x, y } = JSON.parse(telBox); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await send("Input.insertText", { text: phone }); await sleep(250); phoneFilled = true; }
phoneFilled = phoneFilled || (await typeInto("+231 77", phone)) || (await typeInto("phone", phone));
const formState = await ev(`JSON.stringify([...document.querySelectorAll('input')].slice(1, 4).map((i) => i.value))`);
check("form holds the typed values", /Uiflow/.test(formState) && /Tester/.test(formState), formState);
check("customer form accepts input", phoneFilled === true, `phone field filled=${phoneFilled}`);

await clickText("Register Customer|Save Customer|Register$|^Register customer$");
await sleep(5000);

const after = await ev(`document.body.innerText.match(/(\\d+) registered/)?.[1] ?? null`);
check("customer count increased in the UI", Number(after) === Number(before) + 1, `${before} -> ${after}`);

// The real proof: it is in the database, not just in React state.
const persisted = await ev(`fetch(${JSON.stringify(`${SUPABASE}/rest/v1/customers?phone=eq.`)} + encodeURIComponent(${JSON.stringify(phone)}) + '&select=id,first_name,last_name', { headers: { apikey: ${JSON.stringify(ANON)}, Authorization: 'Bearer ' + ${JSON.stringify(accessToken)} } }).then(r => r.json()).then(j => JSON.stringify(j))`);
check("customer created in the UI is persisted in Supabase", (JSON.parse(persisted) || []).length === 1, persisted?.slice(0, 120));

// Reload: it must survive, which local-only state would not.
await send("Page.navigate", { url: `${BASE}/platform` }); await sleep(6000);
await clickText("Customers");
await sleep(3000);
const survives = await ev(`document.body.innerText.includes('Uiflow')`);
check("customer still present after a full reload", survives === true, `found=${survives}`);

// ── Owner view: real staff records and honest financial labels ──────────
await signIn("ownerA@e2e.local");

await clickText("Staff");
await sleep(3500);
const staffText = await ev(`document.body.innerText`);
check("staff screen lists real database staff", /Owner A/.test(staffText) && /Staff A/.test(staffText), staffText.slice(0, 80).replace(/\n/g, " | "));
check("staff screen no longer shows the seeded fixture staff",
  !/Mary Weah|James Doe|Fatu Kamara|John Kamara/.test(staffText), "checked seeded names");

await clickText("Financials");
await sleep(3500);
const finText = await ev(`document.body.innerText`);
check("financials declare what is not tracked instead of inventing it",
  /Not tracked yet/.test(finText) && /Operating expenses/.test(finText), finText.slice(0, 100).replace(/\n/g, " | "));
check("financials no longer show the seeded cash/profit figures",
  !/\$3,240|55\.6%|↑ 22%/.test(finText), "checked seeded financial figures");
check("financials show real revenue from recorded sales", /Revenue \(30d\)|REVENUE \(30D\)/i.test(finText), finText.slice(0, 60).replace(/\n/g, " | "));

const errors = events.filter((e) => e.method === "Log.entryAdded" && e.params.entry.level === "error").map((e) => e.params.entry.text);
check("no console errors during the workflow", errors.length === 0, errors.slice(0, 2).join(" | ").slice(0, 160));

console.log(`\n# ${pass + fail} UI checks, ${fail} failed`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
