// NevOut Meds — Phase 4 UI tests.
//
// These drive the built app in a real browser against the local Supabase stack
// and sign in through the app's own form, with no injected session: the whole
// path (form → GoTrue → Kong → PostgREST) is exercised.
//
// Prerequisites: supabase/tests/seed_e2e.sh, and the built app served at APP_BASE.
import { spawn } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.APP_BASE || "http://127.0.0.1:4178";
const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(process.env.CHROME, ["--remote-debugging-port=9340", `--user-data-dir=${process.env.UDD}`, "about:blank"], { stdio: "ignore" });
let list;
for (let i = 0; i < 80; i++) { try { list = await (await fetch("http://127.0.0.1:9340/json/list")).json(); break; } catch { await sleep(250); } }
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const events = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else events.push(d); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable");

let pass = 0, fail = 0;
const check = (desc, ok, detail) => {
  if (ok) { pass++; console.log(`ok   ${desc}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`NOT OK ${desc} [${detail}]`); }
};

const rectOf = (expr) => ev(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2}); })()`);
async function clickAt(box) {
  const { x, y } = JSON.parse(box);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(600);
}
const clickText = async (pattern, tag = "button") => {
  const box = await rectOf(`[...document.querySelectorAll('${tag}')].find((e) => new RegExp(${JSON.stringify(pattern)}).test(e.textContent))`);
  if (!box) return false;
  await clickAt(box);
  return true;
};
const typeIn = async (selectorExpr, value) => {
  const box = await rectOf(selectorExpr);
  if (!box) return false;
  await clickAt(box);
  await send("Input.insertText", { text: value });
  await sleep(200);
  return true;
};

// ── 1. Real sign-in through the app's own login form ────────────────────────
await send("Page.navigate", { url: `${BASE}/login` });
await sleep(4000);
await typeIn(`[...document.querySelectorAll('input')].find(i => /email/i.test(i.type + ' ' + (i.placeholder||'') + ' ' + (i.autocomplete||'')))`, "ownerA@e2e.local");
await typeIn(`document.querySelector('input[type=password]')`, IDS.password);
await clickText("Sign in|Log in|Continue");
await sleep(7000);
let info = await ev(`({path: location.pathname, text: document.body.innerText.slice(0,200).replace(/\\n/g,' | ')})`);
check("owner signs in through the real login form (no injected session)", info.path === "/platform", `path=${info.path} ${info.text.slice(0, 60)}`);
check("a Supabase session is stored after real login",
  (await ev(`Object.keys(localStorage).some(k => k.includes('auth-token'))`)) === true, "localStorage session");

// ── 2. Staff management screen ──────────────────────────────────────────────
await clickText("Staff");
await sleep(4000);
let staffText = await ev(`document.body.innerText`);
check("owner sees the real team directory", /Owner A/.test(staffText) && /Staff A/.test(staffText), staffText.slice(0, 70).replace(/\n/g, " | "));
check("team members show their status", /Active/.test(staffText), "status pill");

const inviteEmail = `uiinvite${Date.now()}@e2e.local`;
check("invite dialog opens", await clickText("Invite team member"), "");
await sleep(1200);
await typeIn(`[...document.querySelectorAll('input')].find(i => (i.placeholder||'').toLowerCase().includes('full name'))`, "UI Invitee");
await typeIn(`[...document.querySelectorAll('input')].find(i => (i.placeholder||'').includes('@'))`, inviteEmail);
await clickText("Send invitation");
await sleep(8000);
// The link is the value of a read-only input, so read values, not page text.
const inviteFieldValues = await ev(`JSON.stringify([...document.querySelectorAll('input')].map(i => i.value))`);
check("invitation link is returned to the owner to share", /accept-invite\?token=/.test(inviteFieldValues), inviteFieldValues?.slice(0, 80));
const afterInvite = await ev(`document.body.innerText`);
check("owner is told the invitation was emailed or created",
  /Invitation (emailed|created)/i.test(afterInvite), afterInvite.match(/Invitation [^.]{0,60}/)?.[0] ?? "no confirmation panel");

await clickText("Done");
await sleep(2500);
const withInvite = await ev(`document.body.innerText`);
check("the pending invitation appears in the list", withInvite.includes(inviteEmail) && /Invitation pending/.test(withInvite), "pending row");
check("the team activity log records the invitation", /invited/.test(withInvite), "audit entry");

// ── 3. Staff cannot reach owner-only screens ────────────────────────────────
await clickText("Logout");
await sleep(4000);
info = await ev(`({path: location.pathname})`);
check("logout returns the user to a public page", info.path === "/login" || info.path === "/", `path=${info.path}`);

await send("Page.navigate", { url: `${BASE}/platform` });
await sleep(3500);
info = await ev(`({path: location.pathname})`);
check("a signed-out visitor cannot open the workspace", info.path === "/login", `path=${info.path}`);

await send("Page.navigate", { url: `${BASE}/login` });
await sleep(3500);
await typeIn(`[...document.querySelectorAll('input')].find(i => /email/i.test(i.type + ' ' + (i.placeholder||'') + ' ' + (i.autocomplete||'')))`, "staffA@e2e.local");
await typeIn(`document.querySelector('input[type=password]')`, IDS.password);
await clickText("Sign in|Log in|Continue");
await sleep(7000);
const staffNav = await ev(`JSON.stringify([...document.querySelectorAll('button')].map(b => b.textContent.trim()))`);
check("staff signs in successfully", (await ev(`location.pathname`)) === "/platform", "platform");
check("staff does not see the owner-only Staff section", !/👤Staff/.test(staffNav), staffNav.slice(0, 80));

// ── 4. Suspension ends a live session ───────────────────────────────────────
// Suspend the signed-in staff member out-of-band, as the owner would.
const ownerLogin = await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "ownerA@e2e.local", password: IDS.password })
})).json();
const suspendRes = await fetch(`${API}/functions/v1/staff-admin`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${ownerLogin.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "suspend", user_id: IDS.staffA })
});
check("owner suspends the signed-in staff member", suspendRes.status === 200, `${suspendRes.status}`);

await send("Page.navigate", { url: `${BASE}/platform` });
await sleep(7000);
info = await ev(`({path: location.pathname, text: document.body.innerText.slice(0,160).replace(/\\n/g,' | ')})`);
check("the suspended user's browser session no longer opens the workspace",
  info.path === "/login", `path=${info.path} ${info.text.slice(0, 60)}`);
const leftover = await ev(`(async () => {
  const keys = await caches.keys();
  const all = await Promise.all(keys.map(async (k) => (await (await caches.open(k)).keys()).map((r) => r.url)));
  return JSON.stringify(all.flat().filter((u) => u.includes('55421')));
})()`);
check("no pharmacy API responses are left in the offline cache", leftover === "[]", leftover?.slice(0, 80));

// Restore the fixture for later runs.
await fetch(`${API}/functions/v1/staff-admin`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${ownerLogin.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "reactivate", user_id: IDS.staffA })
});

const errors = events.filter((e) => e.method === "Log.entryAdded" && e.params.entry.level === "error")
  .map((e) => e.params.entry.text)
  // A suspended session legitimately produces 401/403 responses.
  .filter((t) => !/401|403/.test(t));
check("no unexpected console errors during the workflow", errors.length === 0, errors.slice(0, 2).join(" | ").slice(0, 160));

console.log(`\n# ${pass + fail} staff/auth UI checks, ${fail} failed`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
