#!/usr/bin/env node
// NevOut Meds — controlled LIVE two-step-verification proof (Phase 11).
//
// Runs the real production flow end to end with ONE synthetic owner, ONE
// synthetic staff member and ONE synthetic pharmacy, then deletes every trace:
//
//   provisioning (ops/provision/provision-owner.mjs, the real operator tool)
//   → password setup through the single-use link → owner sign-in → onboarding
//   → mandatory TOTP enrollment in the REAL app (QR/key screen) → wrong code
//   rejected → right code opens the workspace → sign out → sign in again →
//   code required → reload does not bypass → owner sees only their pharmacy →
//   cross-tenant attempts refused → staff capability rules → owner resets the
//   staff member's MFA through the deployed staff-admin Edge Function →
//   operator resets the OWNER's MFA (ops/security/reset-mfa.mjs) → re-enrollment
//   → security events without secrets → COMPLETE CLEANUP and verification.
//
// It must be run by the operator (it creates accounts and signs in). Passwords
// are random, live only in memory, and are never printed. TOTP secrets and codes
// are never printed or written anywhere. Synthetic identities only:
//   nevout-mfa-proof-<stamp>@example.com   (RFC 2606 domain: no real mailbox)
//   "SYNTHETIC MFA PROOF <stamp> — DELETE" (pharmacy name)
//
// Usage (operator machine; service-role key file chmod 600):
//   NEVOUT_SUPABASE_URL=https://qohpyeqyveusnxhnbtxz.supabase.co \
//   NEVOUT_SERVICE_ROLE_KEY_FILE=~/nevout/service.key \
//   NEVOUT_ANON_KEY_FILE=~/nevout/anon.key \
//   NEVOUT_APP_URL=https://nevout-meds-liberia-pilot.vercel.app \
//   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     node ops/security/live-mfa-proof.mjs --yes
//
//   --cleanup-only   remove anything left by an interrupted run (from the state file)
//   --support-email <address>
//                    support-contact check only: one synthetic owner
//                    (nevout-support-test-<stamp>@example.com, pharmacy "SYNTHETIC SUPPORT TEST —
//                    DELETE") is provisioned, enrolled and signed in; Account menu → Help & feedback
//                    must show "Email support" pointing exactly at <address> and no other address.
//                    Nothing is sent. Then the same complete cleanup. Requires CHROME.
//   Without CHROME the browser steps are skipped (API-level proof only).
//
// No email is sent (setup links come from generate_link; staff are invited by
// RPC, not the Edge Function's email path). Not removed, by design: Supabase
// Auth's own audit log entries for the synthetic emails (the platform's security
// trail), and the local ops logs (provision.log, security-ops.log; gitignored).
// The operator-reset step is recorded with ticket LIVE-PROOF-<stamp>.
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const flag = (n) => process.argv.includes(`--${n}`);
const opt = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const env = (k) => { const v = process.env[k]; if (!v) { console.error(`${k} is not set`); process.exit(64); } return v.replace(/\/$/, ""); };
const readKey = (k) => {
  const f = env(k);
  if ((fs.statSync(f).mode & 0o077) !== 0) { console.error(`${f} must be chmod 600`); process.exit(64); }
  return fs.readFileSync(f, "utf8").trim();
};
const API = env("NEVOUT_SUPABASE_URL");
const APP = env("NEVOUT_APP_URL");
const SERVICE = readKey("NEVOUT_SERVICE_ROLE_KEY_FILE");
const ANON = readKey("NEVOUT_ANON_KEY_FILE");
const CHROME = process.env.CHROME || "";
const STATE = path.join(os.tmpdir(), "nevout-live-mfa-proof.state.json");
const SUPPORT = (opt("support-email") || "").trim().toLowerCase() || null;
// Every synthetic identity this tool can create, in either mode (used by the leftover checks).
const SYNTHETIC_EMAIL = /^nevout-(mfa-proof|support-test)-/;
const SYNTHETIC_PHARMACIES = "or=(name.like.SYNTHETIC%20MFA%20PROOF*,name.like.SYNTHETIC%20SUPPORT%20TEST*)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const results = [];
const check = (id, desc, ok, detail = "") => {
  results.push({ id, desc, ok: !!ok });
  if (ok) { pass++; console.log(`ok     ${id} ${desc}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`NOT OK ${id} ${desc} [${detail}]`); }
};

// ── TOTP, playing the part of the person's authenticator app (never printed) ──
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(s) { let bits = 0, val = 0; const out = []; for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret, ms = Date.now()) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(ms / 30000)));
  const h = crypto.createHmac("sha1", b32(secret)).update(buf).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function http(method, url, { key = ANON, token, body, headers = {}, redirect = "follow" } = {}) {
  const r = await fetch(url, { method, redirect, headers: { apikey: key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: r.status, json, text, headers: r.headers };
}
const admin = (method, p, body) => http(method, `${API}${p}`, { key: SERVICE, token: SERVICE, body });
const rest = (token, p, opt = {}) => http(opt.method ?? "GET", `${API}/rest/v1/${p}`, { token, body: opt.body, headers: opt.headers });
const rpc = (token, fn, body = {}) => http("POST", `${API}/rest/v1/rpc/${fn}`, { token, body });
// Called with the app's Origin, exactly as the browser app calls it (the function's CORS allow-list applies).
const edge = (token, body) => http("POST", `${API}/functions/v1/staff-admin`, { token, body, headers: { Origin: new URL(APP).origin } });
const claims = (jwt) => JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString());
async function passwordLogin(email, password) {
  const r = await http("POST", `${API}/auth/v1/token?grant_type=password`, { body: { email, password } });
  return r.status === 200 ? r.json : null;
}
async function verifyFactor(token, factorId, code) {
  const ch = await http("POST", `${API}/auth/v1/factors/${factorId}/challenge`, { token, body: {} });
  if (ch.status !== 200) return { status: ch.status, session: null };
  const v = await http("POST", `${API}/auth/v1/factors/${factorId}/verify`, { token, body: { challenge_id: ch.json.id, code } });
  return { status: v.status, session: v.status === 200 ? v.json : null };
}
// Follows the single-use link printed by the provisioning tool, as the person would, and sets the password.
async function setPasswordViaLink(toolOutput, password) {
  const link = (String(toolOutput).match(/https?:\/\/\S+\/auth\/v1\/verify\S+/) ?? [])[0];
  if (!link) return false;
  const r = await fetch(link, { redirect: "manual" });
  const token = new URLSearchParams((r.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
  return !!token && (await http("PUT", `${API}/auth/v1/user`, { token, body: { password } })).status === 200;
}
const verifiedFactors = async (userId) => ((await admin("GET", `/auth/v1/admin/users/${userId}`)).json?.factors ?? []).filter((f) => f.status === "verified");

// ── State (so an interrupted run can always be cleaned up) ────────────────────
const saveState = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2), { mode: 0o600 });
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return null; } };

// Rows that can carry a user without a pharmacy (e.g. logged before onboarding).
const USER_TABLES = ["app_logs", "app_feedback", "mutation_receipts", "app_events", "security_events"];
// Every table that carries pharmacy_id, children before parents (FKs are RESTRICT).
const TENANT_TABLES = ["purchase_items", "purchase_order_items", "stock_movements", "inventory", "purchases", "purchase_orders",
  "supplier_catalogue", "suppliers", "products", "reminders", "customers", "documents", "staff_invitations", "staff_audit_log",
  "app_events", "app_feedback", "app_logs", "mutation_receipts", "pharmacy_config_changes", "security_events", "users_profiles"];

async function cleanup(st) {
  if (!st) return { ok: true, notes: ["nothing to clean"] };
  const notes = [];
  const userIds = [st.ownerId, st.staffId].filter(Boolean);
  if (st.pharmacyId) {
    // Storage objects under the pharmacy's prefix, if any were created.
    const list = await http("POST", `${API}/storage/v1/object/list/documents`, { key: SERVICE, token: SERVICE, body: { prefix: `${st.pharmacyId}/`, limit: 1000 } });
    const names = (list.json ?? []).map((o) => `${st.pharmacyId}/${o.name}`);
    if (names.length) { await http("DELETE", `${API}/storage/v1/object/documents`, { key: SERVICE, token: SERVICE, body: { prefixes: names } }); notes.push(`${names.length} storage objects`); }
    for (const t of TENANT_TABLES) {
      const r = await admin("DELETE", `/rest/v1/${t}?pharmacy_id=eq.${st.pharmacyId}`);
      if (r.status >= 300) notes.push(`${t}: ${r.status} ${r.text.slice(0, 80)}`);
    }
  }
  for (const uid of userIds) {
    for (const t of USER_TABLES) await admin("DELETE", `/rest/v1/${t}?user_id=eq.${uid}`);
    await admin("DELETE", `/rest/v1/users_profiles?id=eq.${uid}`);
  }
  if (st.pharmacyId) {
    const r = await admin("DELETE", `/rest/v1/pharmacies?id=eq.${st.pharmacyId}`);
    if (r.status >= 300) notes.push(`pharmacies: ${r.status} ${r.text.slice(0, 120)}`);
  }
  // Deleting the Auth user also removes its MFA factors, identities and sessions.
  for (const uid of userIds) {
    const r = await admin("DELETE", `/auth/v1/admin/users/${uid}`);
    if (r.status >= 300 && r.status !== 404) notes.push(`auth user: ${r.status}`);
  }
  return { ok: notes.every((n) => !/: [45]\d\d/.test(n)), notes };
}

async function verifyClean(st) {
  const out = {};
  const users = (await admin("GET", `/auth/v1/admin/users?page=1&per_page=1000`)).json?.users ?? [];
  out.synthetic_users = users.filter((u) => SYNTHETIC_EMAIL.test(u.email ?? "")).length;
  out.auth_users_total = users.length;
  out.synthetic_pharmacies = ((await admin("GET", `/rest/v1/pharmacies?select=id&${SYNTHETIC_PHARMACIES}`)).json ?? []).length;
  out.pharmacies_total = ((await admin("GET", `/rest/v1/pharmacies?select=id`)).json ?? []).length;
  let leftovers = 0;
  if (st?.pharmacyId) for (const t of [...TENANT_TABLES]) leftovers += ((await admin("GET", `/rest/v1/${t}?select=pharmacy_id&pharmacy_id=eq.${st.pharmacyId}`)).json ?? []).length;
  for (const uid of [st?.ownerId, st?.staffId].filter(Boolean)) {
    for (const t of USER_TABLES) leftovers += ((await admin("GET", `/rest/v1/${t}?select=user_id&user_id=eq.${uid}`)).json ?? []).length;
    leftovers += ((await admin("GET", `/rest/v1/users_profiles?select=id&id=eq.${uid}`)).json ?? []).length;
  }
  leftovers += ((await admin("GET", `/rest/v1/staff_invitations?select=id&or=(email.like.nevout-mfa-proof*,email.like.nevout-support-test*)`)).json ?? []).length;
  out.tenant_rows_left = leftovers;
  return out;
}

// ── Minimal headless browser (Chrome DevTools Protocol) ──────────────────────
async function browser() {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "nevout-mfa-proof-chrome-"));
  const port = 9600 + Math.floor(Math.random() * 300);
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, "--no-first-run", "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
  let list; for (let i = 0; i < 80 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Runtime.enable"); await send("Page.enable");
  const waitFor = async (expr, ms = 20000) => { for (let i = 0; i < ms / 250; i++) { if (await ev(expr)) return true; await sleep(250); } return false; };
  const setValue = (sel, value) => ev(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  return {
    ev, waitFor, setValue,
    go: async (url) => { await send("Page.navigate", { url }); await sleep(2500); },
    submit: (sel) => ev(`(() => { const f = document.querySelector(${JSON.stringify(sel)})?.closest('form'); if (!f) return false; f.requestSubmit(); return true; })()`),
    clickText: (re) => ev(`(() => { const b = [...document.querySelectorAll('button,[role=menuitem],a')].find(e => new RegExp(${JSON.stringify(re)}).test(e.textContent.trim())); if (!b) return false; b.click(); return true; })()`),
    close: async () => {
      try { ws.close(); } catch { /* already closed */ }
      const exited = new Promise((r) => proc.once("exit", r));
      proc.kill();
      await Promise.race([exited, sleep(5000)]);
      try { fs.rmSync(udd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp profile; the OS clears it */ }
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
if (flag("cleanup-only")) {
  const st = loadState();
  const c = await cleanup(st);
  console.log("cleanup:", c.notes.join("; ") || "done");
  console.log("verify:", JSON.stringify(await verifyClean(st)));
  if (st) fs.rmSync(STATE, { force: true });
  process.exit(0);
}
if (SUPPORT && (!CHROME || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SUPPORT))) { console.error("--support-email needs a valid address and CHROME"); process.exit(64); }
if (!flag("yes")) { console.log("This creates and then deletes ONE synthetic owner, staff member and pharmacy in the target project.\nRe-run with --yes to proceed."); process.exit(0); }
if (loadState()) { console.error(`A previous run left state in ${STATE}. Run with --cleanup-only first.`); process.exit(1); }

const STAMP = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const OWNER_EMAIL = SUPPORT ? `nevout-support-test-${STAMP}@example.com` : `nevout-mfa-proof-${STAMP}@example.com`;
const STAFF_EMAIL = `nevout-mfa-proof-staff-${STAMP}@example.com`;
const PHARMACY = SUPPORT ? "SYNTHETIC SUPPORT TEST — DELETE" : `SYNTHETIC MFA PROOF ${STAMP} — DELETE`;
const PHARMACY_LABEL = SUPPORT ? "SYNTHETIC SUPPORT TEST" : `SYNTHETIC MFA PROOF ${STAMP}`;
// Random, in memory only; the suffix satisfies any upper/lower/digit/symbol password policy.
const ownerPw = `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
const staffPw = `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
const baseline = await verifyClean(null); // the project's totals before anything is created
const st = { stamp: STAMP, ownerEmail: OWNER_EMAIL, staffEmail: STAFF_EMAIL, baseline };
saveState(st);
const secretsUsed = [];
const codesUsed = [];
const toolEnv = { ...process.env, NEVOUT_SUPABASE_URL: API, NEVOUT_SERVICE_ROLE_KEY_FILE: process.env.NEVOUT_SERVICE_ROLE_KEY_FILE };
let exitCode = 1;

try {
  console.log(`# target ${API} · app ${APP} · stamp ${STAMP} · before: ${baseline.auth_users_total} auth users, ${baseline.pharmacies_total} pharmacies`);

  // 1. Provision with the real operator tool, then set the password via the single-use link.
  const prov = execFileSync("node", [path.join(ROOT, "ops/provision/provision-owner.mjs"), "--email", OWNER_EMAIL, "--name", "Synthetic MFA Proof Owner", "--app-url", APP, "--yes"], { env: toolEnv, encoding: "utf8" });
  const link = (prov.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/) ?? [])[0];
  const owner = ((await admin("GET", `/auth/v1/admin/users?page=1&per_page=1000`)).json?.users ?? []).find((u) => u.email === OWNER_EMAIL);
  st.ownerId = owner?.id; saveState(st);
  check("T1", "synthetic owner provisioned with the operator tool (email confirmed, no password)", !!link && !!owner && !!owner.email_confirmed_at, owner ? "account + single-use link" : "no account");
  check("T1b", "the single-use link opens a session and the owner sets their own password", await setPasswordViaLink(prov, ownerPw));
  const reuse = await fetch(link, { redirect: "manual" });
  check("T1c", "the setup link cannot be used twice", !/access_token=/.test(reuse.headers.get("location") ?? ""), "single use");

  // 2. Sign in, create the synthetic pharmacy through onboarding.
  let s = await passwordLogin(OWNER_EMAIL, ownerPw);
  check("T2a", "owner signs in with their password (aal1)", s && claims(s.access_token).aal === "aal1", s ? claims(s.access_token).aal : "login failed");
  const onboard = await rpc(s.access_token, "onboard_pharmacy", { p_settings: { name: PHARMACY, country_code: "LR", city: "Synthetic", phone: "", owner_name: "Synthetic MFA Proof Owner" } });
  const prof = (await rest(s.access_token, `users_profiles?select=pharmacy_id,role&id=eq.${st.ownerId}`)).json?.[0];
  st.pharmacyId = prof?.pharmacy_id; saveState(st);
  check("T2b", "onboarding creates the synthetic pharmacy and makes them its owner", onboard.status < 300 && prof?.role === "owner" && !!st.pharmacyId, `${onboard.status} ${prof?.role ?? onboard.text.slice(0, 80)}`);

  // 3. Without MFA: no privileged access, server-side.
  const p0 = (await rpc(s.access_token, "my_security_posture")).json;
  check("T3a", "posture: MFA required, not enrolled, not satisfied, no capabilities", p0?.mfa_required && !p0?.mfa_enrolled && !p0?.mfa_satisfied && (p0?.capabilities ?? []).length === 0, JSON.stringify(p0).slice(0, 120));
  check("T3b", "aal1 owner reads no pharmacy row (PostgREST)", ((await rest(s.access_token, "pharmacies?select=id")).json ?? []).length === 0);
  check("T3c", "aal1 owner cannot read financials (RPC)", (await rpc(s.access_token, "financial_summary", { p_days: 30 })).status >= 400);
  check("T3d", "aal1 owner cannot use the staff-admin Edge Function", (await edge(s.access_token, { action: "reset_mfa", user_id: crypto.randomUUID() })).status === 403);

  // 4. The real app: setup screen, QR + key, wrong code, right code, sign out, sign in, reload.
  let ownerSecret = null;
  if (CHROME) {
    const b = await browser();
    try {
      await b.go(`${APP}/login`);
      await b.setValue('input[type=email]', OWNER_EMAIL);
      await b.setValue('input[type=password]', ownerPw);
      await b.submit('input[type=password]');
      const setup = await b.waitFor(`!!document.querySelector('.nv-totp__key') && !!document.querySelector('.nv-totp__qr') && !document.querySelector('[data-nav-id]')`, 30000);
      check("U1", "app: after sign-in the owner sees the setup screen (QR + manual key), not the workspace", setup);
      ownerSecret = await b.ev(`document.querySelector('.nv-totp__key')?.textContent?.replace(/\\s+/g, '') || null`);
      if (ownerSecret) secretsUsed.push(ownerSecret);
      await b.setValue('input[autocomplete="one-time-code"]', "000000"); await sleep(200);
      await b.ev(`document.querySelector('form.nv-totp')?.requestSubmit(), 1`);
      check("U2", "app: a wrong code is rejected during setup", await b.waitFor(`/didn’t match/.test(document.body.innerText) && !document.querySelector('[data-nav-id]')`, 15000));
      const c1 = totp(ownerSecret); codesUsed.push(c1);
      await b.setValue('input[autocomplete="one-time-code"]', c1); await sleep(200);
      await b.ev(`document.querySelector('form.nv-totp')?.requestSubmit(), 1`);
      const done = await b.waitFor(`[...document.querySelectorAll('button')].some(x => x.textContent.trim() === 'Continue')`, 15000);
      check("U3", "app: the right code turns on two-step verification (lost-phone advice shown)", done && /If you lose your phone/.test(await b.ev(`document.body.innerText`)));
      await b.clickText("^Continue$");
      const ws1 = await b.waitFor(`!!document.querySelector('[data-nav-id]')`, 20000);
      const shown = await b.ev(`document.body.innerText`);
      check("U4", "app: the workspace opens only now, showing the synthetic pharmacy", ws1 && shown.includes(PHARMACY_LABEL));
      check("U4b", "app: the key is no longer displayed after setup", !(await b.ev(`!!document.querySelector('.nv-totp__key')`)));
      if (SUPPORT) {
        // Account menu → Help & feedback. Only reads the dialog; nothing is sent.
        await b.ev(`document.querySelector('button[aria-label^="Account menu"]')?.click(), 1`); await sleep(500);
        await b.clickText("^Help & feedback$");
        const opened = await b.waitFor(`[...document.querySelectorAll('dialog[open], [role=dialog]')].some((d) => /Help & feedback/.test(d.textContent))`, 15000);
        const info = await b.ev(`(() => {
          const d = [...document.querySelectorAll('dialog[open], [role=dialog]')].find((x) => /Help & feedback/.test(x.textContent));
          if (!d) return null;
          const links = [...d.querySelectorAll('a')];
          const email = links.filter((a) => a.textContent.trim() === 'Email support');
          const hrefs = links.map((a) => a.getAttribute('href') || '');
          const addrs = (d.innerText + ' ' + hrefs.join(' ')).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g) || [];
          return { emailLinks: email.length, href: email[0]?.getAttribute('href') ?? null, mailtos: hrefs.filter((h) => /^mailto:/i.test(h)), addrs: [...new Set(addrs.map((x) => x.toLowerCase()))] };
        })()`);
        check("S1", "Help & feedback opens and shows exactly one Email support link", opened && info?.emailLinks === 1, JSON.stringify(info ?? {}).slice(0, 160));
        let recipient = null;
        try { const u = new URL(info?.href ?? ""); if (u.protocol === "mailto:" && !u.search) recipient = decodeURIComponent(u.pathname); } catch { /* not a URL */ }
        check("S2", `the Email support link's recipient is exactly ${SUPPORT}`, recipient === SUPPORT, `recipient: ${recipient ?? "none"} · href: ${info?.href ?? "none"}`);
        check("S3", "no other email address or mailto link appears in the dialog (no old fallback)", (info?.mailtos ?? []).length === 1 && (info?.addrs ?? []).every((a) => a === SUPPORT), `addresses: ${(info?.addrs ?? []).join(", ") || "none"}`);
      } else {
      await b.ev(`document.querySelector('button[aria-label^="Account menu"]')?.click(), 1`); await sleep(500);
      await b.clickText("^Sign out$");
      check("U5", "app: sign out returns to the sign-in page", await b.waitFor(`location.pathname === '/login'`, 15000));
      await b.setValue('input[type=email]', OWNER_EMAIL);
      await b.setValue('input[type=password]', ownerPw);
      await b.submit('input[type=password]');
      check("U6", "app: signing in again asks for the code (no workspace yet)", await b.waitFor(`!!document.querySelector('input[autocomplete="one-time-code"]') && !document.querySelector('[data-nav-id]')`, 30000));
      await b.go(`${APP}/platform`);
      check("U7", "app: reloading during the code step does not bypass it", await b.waitFor(`!!document.querySelector('input[autocomplete="one-time-code"]') && !document.querySelector('[data-nav-id]')`, 20000));
      await b.setValue('input[autocomplete="one-time-code"]', "123123"); await sleep(200);
      await b.submit('input[autocomplete="one-time-code"]');
      check("U8", "app: a wrong code at sign-in is rejected", await b.waitFor(`/didn’t match/.test(document.body.innerText) && !document.querySelector('[data-nav-id]')`, 15000));
      for (let i = 0; i < 40 && totp(ownerSecret) === c1; i++) await sleep(1000); // use a fresh code
      const c2 = totp(ownerSecret); codesUsed.push(c2);
      await b.setValue('input[autocomplete="one-time-code"]', c2); await sleep(200);
      await b.submit('input[autocomplete="one-time-code"]');
      check("U9", "app: the right code at sign-in opens the workspace", await b.waitFor(`!!document.querySelector('[data-nav-id]')`, 20000));
      const stored = await b.ev(`JSON.stringify(Object.keys(localStorage))`);
      check("U10", "app: no 'MFA passed' flag is stored by the app", !/mfa|aal|verified/i.test(stored), stored);
      }
    } finally { await b.close(); }
  } else {
    // API-level enrollment (same Supabase Auth MFA API the app uses).
    const e = await http("POST", `${API}/auth/v1/factors`, { token: s.access_token, body: { factor_type: "totp", friendly_name: "Authenticator app" } });
    check("U1", "enrollment returns a QR code and a key from Supabase Auth (browser steps skipped: no CHROME)", e.status === 200 && /^(data:image\/svg|<svg|<\?xml)/.test(e.json?.totp?.qr_code ?? "") && !!e.json?.totp?.secret, `${e.status} ${String(e.json?.totp?.qr_code ?? "").slice(0, 14)}`);
    ownerSecret = e.json?.totp?.secret; if (ownerSecret) secretsUsed.push(ownerSecret);
    const bad = await verifyFactor(s.access_token, e.json?.id, "000000");
    check("U2", "a wrong code is rejected", bad.status === 422, `${bad.status}`);
    const c = totp(ownerSecret); codesUsed.push(c);
    const ok = await verifyFactor(s.access_token, e.json?.id, c);
    check("U3", "the right code turns on two-step verification", !!ok.session);
  }

  rest: {
  if (SUPPORT) break rest; // support-contact mode stops here; cleanup follows
  // 5. Assurance, refresh, own pharmacy only, cross-tenant refusals.
  s = await passwordLogin(OWNER_EMAIL, ownerPw);
  const ownerFactor = (await verifiedFactors(st.ownerId))[0];
  check("T5a", "a fresh password sign-in is aal1 again (the code is required)", claims(s.access_token).aal === "aal1" && !!ownerFactor);
  check("T5b", "…and at aal1 still reads no pharmacy data", ((await rest(s.access_token, "pharmacies?select=id")).json ?? []).length === 0);
  check("T5c", "a wrong code is rejected by Supabase Auth", (await verifyFactor(s.access_token, ownerFactor?.id, "000000")).status === 422);
  for (let i = 0; i < 40 && codesUsed.includes(totp(ownerSecret)); i++) await sleep(1000);
  const c3 = totp(ownerSecret); codesUsed.push(c3);
  const aal2 = (await verifyFactor(s.access_token, ownerFactor?.id, c3)).session;
  check("T5d", "the right code gives an aal2 session", aal2 && claims(aal2.access_token).aal === "aal2");
  const refreshed = (await http("POST", `${API}/auth/v1/token?grant_type=refresh_token`, { body: { refresh_token: aal2?.refresh_token } })).json;
  const fresh1 = await passwordLogin(OWNER_EMAIL, ownerPw); // a separate session that never passes the second step
  const r1 = (await http("POST", `${API}/auth/v1/token?grant_type=refresh_token`, { body: { refresh_token: fresh1?.refresh_token } })).json;
  check("T5e", "a session refresh keeps aal2; refreshing a session that never verified stays aal1",
    claims(refreshed?.access_token ?? "e30.e30.x").aal === "aal2" && claims(r1?.access_token ?? "e30.e30.x").aal === "aal1",
    `${claims(refreshed?.access_token ?? "e30.e30.x").aal}/${claims(r1?.access_token ?? "e30.e30.x").aal}`);
  const tok = refreshed.access_token;
  const own = (await rest(tok, "pharmacies?select=id,name")).json ?? [];
  check("T10", "the owner sees exactly one pharmacy: the synthetic one", own.length === 1 && own[0].id === st.pharmacyId && own[0].name === PHARMACY, `${own.length}`);
  const other = crypto.randomUUID();
  const cross1 = await rest(tok, "customers", { method: "POST", body: { pharmacy_id: other, phone: "+231000000000", first_name: "Synthetic", last_name: "Probe" }, headers: { Prefer: "return=minimal" } });
  const cross2 = await rpc(tok, "record_purchase", { p_pharmacy_id: other, p_customer_id: null, p_method: "Cash", p_staff_id: st.ownerId, p_items: [] });
  const cross3 = await rpc(tok, "import_inventory_levels", { p_pharmacy_id: other, p_rows: [] });
  check("T11", "cross-tenant writes are refused (PostgREST insert, sale RPC, import RPC)", cross1.status >= 400 && cross2.status >= 400 && cross3.status >= 400, `${cross1.status}/${cross2.status}/${cross3.status}`);
  check("T11b", "the owner holds owner capabilities, not platform admin", (await rpc(tok, "admin_pilot_overview")).status >= 400 && ((await rpc(tok, "my_security_posture")).json?.capabilities ?? []).length === 31);

  // 6. Staff capability rules + owner reset of a staff member's MFA via the Edge Function.
  const inv = await rpc(tok, "invite_staff", { p_email: STAFF_EMAIL, p_name: "Synthetic MFA Proof Staff", p_role: "staff" });
  const invToken = inv.json?.token;
  const sprov = execFileSync("node", [path.join(ROOT, "ops/provision/provision-owner.mjs"), "--email", STAFF_EMAIL, "--name", "Synthetic MFA Proof Staff", "--app-url", APP, "--for", "staff", "--yes"], { env: toolEnv, encoding: "utf8" });
  const staff = ((await admin("GET", `/auth/v1/admin/users?page=1&per_page=1000`)).json?.users ?? []).find((u) => u.email === STAFF_EMAIL);
  st.staffId = staff?.id; saveState(st);
  check("T12", "synthetic staff account provisioned (--for staff) and sets their own password via the link", await setPasswordViaLink(sprov, staffPw));
  let ss = await passwordLogin(STAFF_EMAIL, staffPw);
  const acc = await rpc(ss?.access_token, "accept_staff_invitation", { p_token: invToken });
  ss = await passwordLogin(STAFF_EMAIL, staffPw);
  const sp = (await rpc(ss.access_token, "my_security_posture")).json;
  check("T12a", "synthetic staff joins via the owner's invitation; MFA optional; 15 capabilities at aal1", acc.status < 300 && sp?.role === "staff" && !sp?.mfa_required && sp?.mfa_satisfied && (sp?.capabilities ?? []).length === 15, JSON.stringify(sp).slice(0, 100));
  check("T12b", "staff are refused owner operations (financials, invitations, documents, settings)",
    (await rpc(ss.access_token, "financial_summary", { p_days: 30 })).status >= 400
    && (await rpc(ss.access_token, "invite_staff", { p_email: "x@example.com", p_role: "staff" })).status >= 400
    && ((await rest(ss.access_token, "documents?select=id")).json ?? []).length === 0
    && (await rpc(ss.access_token, "update_pharmacy_settings", { p_changes: { city: "X" } })).status >= 400);
  const promote = await rest(ss.access_token, `users_profiles?id=eq.${st.staffId}`, { method: "PATCH", body: { role: "owner" }, headers: { Prefer: "return=representation" } });
  const roleAfter = (await admin("GET", `/rest/v1/users_profiles?select=role&id=eq.${st.staffId}`)).json?.[0]?.role;
  const staffReset = await edge(ss.access_token, { action: "reset_mfa", user_id: st.ownerId });
  check("T12c", "staff cannot promote themselves or reset anyone's MFA",
    roleAfter === "staff" && (promote.status >= 400 || (promote.json ?? []).length === 0) && staffReset.status === 403 && (await verifiedFactors(st.ownerId)).length === 1,
    `promote ${promote.status} → role ${roleAfter}; reset ${staffReset.status}`);
  const se = await http("POST", `${API}/auth/v1/factors`, { token: ss.access_token, body: { factor_type: "totp", friendly_name: "Authenticator app" } });
  const staffSecret = se.json?.totp?.secret; if (staffSecret) secretsUsed.push(staffSecret);
  const sc = totp(staffSecret); codesUsed.push(sc);
  check("T12d", "staff can opt in to MFA", !!(await verifyFactor(ss.access_token, se.json?.id, sc)).session);
  const reset = await edge(tok, { action: "reset_mfa", user_id: st.staffId });
  check("T13", "the owner resets the staff member's MFA through the DEPLOYED staff-admin function", reset.status === 200 && reset.json?.factors_removed >= 1 && (await verifiedFactors(st.staffId)).length === 0, `${reset.status} ${reset.text.slice(0, 80)}`);
  check("T14a", "the reset response reveals no secret, key, code or otpauth URI", !/otpauth|secret/i.test(reset.text) && !secretsUsed.some((x) => reset.text.includes(x)));

  // 7. Operator resets the OWNER's MFA (lost phone), then the owner re-enrolls.
  const opOut = execFileSync("node", [path.join(ROOT, "ops/security/reset-mfa.mjs"), "--email", OWNER_EMAIL, "--ticket", `LIVE-PROOF-${STAMP}`, "--verified-by", "synthetic live proof account (no real person)", "--yes"], { env: toolEnv, encoding: "utf8" });
  check("T13b", "the operator reset tool removes the owner's authenticator", /Done: 1 authenticator/.test(opOut) && (await verifiedFactors(st.ownerId)).length === 0);
  check("T14b", "the operator tool output reveals no secret or code", !secretsUsed.some((x) => opOut.includes(x)) && !codesUsed.some((x) => opOut.includes(x)) && !/otpauth/.test(opOut));
  const sx = await passwordLogin(OWNER_EMAIL, ownerPw);
  const oldFactorChallenge = await http("POST", `${API}/auth/v1/factors/${ownerFactor?.id}/challenge`, { token: sx.access_token, body: {} });
  check("T14c", "the old authenticator is gone: its factor can no longer be challenged", oldFactorChallenge.status >= 400, `${oldFactorChallenge.status}`);
  const p2 = (await rpc(sx.access_token, "my_security_posture")).json;
  check("T15a", "after the reset the owner must enroll again (required, not enrolled, no access)", p2?.mfa_required && !p2?.mfa_enrolled && !p2?.mfa_satisfied);
  const re = await http("POST", `${API}/auth/v1/factors`, { token: sx.access_token, body: { factor_type: "totp", friendly_name: "Authenticator app" } });
  const newSecret = re.json?.totp?.secret; if (newSecret) secretsUsed.push(newSecret);
  const rc = totp(newSecret); codesUsed.push(rc);
  const reok = await verifyFactor(sx.access_token, re.json?.id, rc);
  check("T15b", "the owner re-enrolls with a NEW key (different from the old one) and regains access", !!reok.session && newSecret !== ownerSecret
    && ((await rest(reok.session.access_token, "pharmacies?select=id")).json ?? []).length === 1);
  await rpc(reok.session.access_token, "record_security_event", { p_event: "mfa_factor_verified", p_factor_id: re.json?.id });

  // 8. Security events: recorded, and never a secret or a code.
  const evs = (await admin("GET", `/rest/v1/security_events?select=event,actor,detail,user_id&user_id=in.(${st.ownerId},${st.staffId})&order=created_at`)).json ?? [];
  const kinds = evs.map((e) => `${e.event}:${e.actor}`);
  check("T16a", "security events recorded (enrollment, verification, required-not-enrolled, owner reset, operator reset)",
    kinds.includes("mfa_required_not_enrolled:system") && kinds.includes("mfa_admin_reset:owner") && kinds.includes("mfa_admin_reset:operator") && kinds.some((k) => k.startsWith("mfa_factor_verified")), kinds.join(","));
  const blob = JSON.stringify(evs);
  check("T16b", "no event contains a TOTP secret, a code, an otpauth URI or a password", !secretsUsed.some((x) => blob.includes(x)) && !codesUsed.some((x) => blob.includes(x)) && !/otpauth/.test(blob) && !blob.includes(ownerPw) && !blob.includes(staffPw));
  }
  exitCode = 0;
} catch (e) {
  console.log(`NOT OK  run aborted: ${String(e?.message ?? e).slice(0, 200)}`);
  fail++;
} finally {
  // 9. Complete cleanup, always.
  const c = await cleanup(st);
  const v = await verifyClean(st);
  check("C2", "the project is back to its exact totals from before the run (auth users, pharmacies)",
    v.auth_users_total === baseline.auth_users_total && v.pharmacies_total === baseline.pharmacies_total,
    `users ${baseline.auth_users_total}→${v.auth_users_total}, pharmacies ${baseline.pharmacies_total}→${v.pharmacies_total}`);
  check("C1", "cleanup: synthetic users, pharmacy, profiles, factors, sessions, tenant rows and storage removed", c.ok && v.synthetic_users === 0 && v.synthetic_pharmacies === 0 && v.tenant_rows_left === 0, `${c.notes.join("; ") || "ok"} · ${JSON.stringify(v)}`);
  if (c.ok && v.synthetic_users === 0 && v.synthetic_pharmacies === 0 && v.tenant_rows_left === 0) fs.rmSync(STATE, { force: true });
  else console.log(`# state kept in ${STATE}: run again with --cleanup-only`);
  console.log(`\n# ${pass + fail} live MFA proof checks, ${fail} failed`);
  console.log(`# summary ${JSON.stringify({ stamp: STAMP, passed: pass, failed: fail, browser: !!CHROME, remaining: v })}`);
  process.exit(fail || exitCode ? 1 : 0);
}
