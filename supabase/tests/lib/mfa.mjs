// NevOut Meds — test-only TOTP helpers (RFC 6238) for the LOCAL stack.
//
// The app never implements OTP itself: Supabase Auth generates the secret, stores
// it, and verifies codes. These helpers only play the part of the person's
// authenticator app in automated tests, using synthetic accounts. The secrets of
// the synthetic E2E owners live in /tmp/nevout_e2e_ids.json (chmod 600), written
// by seed_e2e.sh — never in the repository and never for a real account.
import crypto from "node:crypto";
import fs from "node:fs";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** The 6-digit code an authenticator app shows for `secret` at time `ms`. */
export function totp(secret, ms = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(ms / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

const IDS_FILE = "/tmp/nevout_e2e_ids.json";
export function readIds() {
  try { return JSON.parse(fs.readFileSync(IDS_FILE, "utf8")); } catch { return {}; }
}
/** The TOTP secret of a synthetic E2E account, if it has one. */
export function secretFor(email) {
  const want = String(email).toLowerCase();
  const entry = Object.entries(readIds().totp ?? {}).find(([k]) => k.toLowerCase() === want);
  return entry ? entry[1] : null;
}

async function call(api, anon, path, { token, body, method = "POST" } = {}) {
  const r = await fetch(`${api}/auth/v1${path}`, {
    method,
    headers: { apikey: anon, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

export async function passwordSession(api, anon, email, password) {
  const r = await call(api, anon, "/token?grant_type=password", { body: { email, password } });
  if (r.status !== 200) throw new Error(`password sign-in failed for ${email}: ${r.status} ${r.text.slice(0, 120)}`);
  return r.json;
}

export async function enrollTotp(api, anon, accessToken, friendlyName = `e2e-${Date.now()}`) {
  const r = await call(api, anon, "/factors", { token: accessToken, body: { factor_type: "totp", friendly_name: friendlyName } });
  if (r.status !== 200) throw new Error(`enroll failed: ${r.status} ${r.text.slice(0, 160)}`);
  return { id: r.json.id, secret: r.json.totp.secret, uri: r.json.totp.uri };
}

export async function listFactors(api, anon, accessToken) {
  const r = await call(api, anon, "/user", { token: accessToken, method: "GET" });
  return (r.json?.factors ?? []);
}

/** Challenge + verify one factor; returns the new (aal2) session. */
export async function verifyTotp(api, anon, accessToken, factorId, secret, codeOverride) {
  const ch = await call(api, anon, `/factors/${factorId}/challenge`, { token: accessToken, body: {} });
  if (ch.status !== 200) throw new Error(`challenge failed: ${ch.status} ${ch.text.slice(0, 160)}`);
  const code = codeOverride ?? totp(secret);
  const v = await call(api, anon, `/factors/${factorId}/verify`, { token: accessToken, body: { challenge_id: ch.json.id, code } });
  return { status: v.status, session: v.status === 200 ? v.json : null, error: v.status === 200 ? null : v.text };
}

/**
 * Signs in like a person would: password, then — if the account has a verified
 * factor and we hold its secret — the authenticator code. Returns the session.
 */
export async function signInFull(api, anon, email, password) {
  const s = await passwordSession(api, anon, email, password);
  const secret = secretFor(email);
  if (!secret) return s;
  const factor = (s.user?.factors ?? []).find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!factor) return s;
  const v = await verifyTotp(api, anon, s.access_token, factor.id, secret);
  if (!v.session) throw new Error(`MFA verification failed for ${email}: ${v.error?.slice(0, 160)}`);
  return v.session;
}

/** Decodes a JWT payload (tests only, to read the aal claim). */
export function claims(jwt) {
  return JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString("utf8"));
}

/** Upgrades a password session to aal2 when the account has a factor we hold the secret for. */
export async function upgradeIfEnrolled(api, anon, email, session) {
  const secret = secretFor(email);
  const factor = (session?.user?.factors ?? []).find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!secret || !factor || !session?.access_token) return session;
  const v = await verifyTotp(api, anon, session.access_token, factor.id, secret);
  if (!v.session) throw new Error(`MFA verification failed for ${email}: ${v.error?.slice(0, 160)}`);
  return v.session;
}

/**
 * Completes MFA on a supabase-js client that has just signed in with a password,
 * exactly as the app does: challengeAndVerify, then give Realtime the new aal2
 * token (supabase-js does not do this on MFA_CHALLENGE_VERIFIED; finding F6).
 */
export async function completeMfaOnClient(client, email) {
  const secret = secretFor(email);
  if (!secret) return null;
  const { data: f } = await client.auth.mfa.listFactors();
  const factor = f?.totp?.find((x) => x.status === "verified");
  if (!factor) return null;
  const { data, error } = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(secret) });
  if (error) throw new Error(`MFA verification failed for ${email}: ${error.message}`);
  const token = data?.access_token ?? (await client.auth.getSession()).data.session?.access_token;
  if (token) client.realtime.setAuth(token);
  return token;
}

/**
 * Browser suites: after submitting the sign-in form, answer the two-step screen
 * the way a person would (type the current code, press Verify). `ev` evaluates
 * JS in the page. Returns "workspace", "mfa" (answered) or "timeout".
 * Accounts without a factor (staff) go straight through.
 */
export async function completeMfaInPage(ev, email, { timeoutMs = 20000 } = {}) {
  const secret = secretFor(email);
  const deadline = Date.now() + timeoutMs;
  let answered = false;
  while (Date.now() < deadline) {
    const state = await ev(`(() => {
      if (document.querySelector('[data-nav-id]')) return "workspace";
      if (document.querySelector('input[autocomplete="one-time-code"]')) return "code";
      return "wait";
    })()`);
    if (state === "workspace") return answered ? "mfa" : "workspace";
    if (state === "code" && secret && !answered) {
      const code = totp(secret);
      await ev(`(() => {
        const i = document.querySelector('input[autocomplete="one-time-code"]');
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(i, ${JSON.stringify(code)});
        i.dispatchEvent(new Event("input", { bubbles: true }));
        return 1;
      })()`);
      await new Promise((r) => setTimeout(r, 250));
      await ev(`(() => { const f = document.querySelector('input[autocomplete="one-time-code"]')?.closest('form'); f?.requestSubmit(); return 1; })()`);
      answered = true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return "timeout";
}

/**
 * Browser suites: complete the "Protect your pharmacy" setup like a person with
 * an authenticator app — read the manual-entry key shown on screen, type the
 * current code, confirm, then Continue. Returns the secret (kept only in the
 * test's memory) or null if the setup screen never appeared.
 */
export async function enrollMfaInPage(ev, { timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let key = null;
  while (Date.now() < deadline && !key) {
    key = await ev(`document.querySelector('.nv-totp__key')?.textContent?.replace(/\\s+/g, '') || null`);
    if (!key) await new Promise((r) => setTimeout(r, 300));
  }
  if (!key) return null;
  const code = totp(key);
  await ev(`(() => {
    const i = document.querySelector('input[autocomplete="one-time-code"]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(i, ${JSON.stringify(code)});
    i.dispatchEvent(new Event("input", { bubbles: true }));
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 250));
  await ev(`(() => { document.querySelector('form.nv-totp')?.requestSubmit(); return 1; })()`);
  for (let i = 0; i < 40; i++) {
    const done = await ev(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue')`);
    if (done) {
      await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue').click(), 1`);
      return key;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/**
 * Test fixtures that create their own OWNER accounts (country pilots, recovery
 * devices): give the account a fresh authenticator through the public MFA API
 * and remember its secret in the E2E ids file, so signIn/apiLogin can answer
 * the second step. Any older factors are removed first with the service role.
 */
export async function ensureTotpFor(api, anon, serviceKey, email, password, userId) {
  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const u = await fetch(`${api}/auth/v1/admin/users/${userId}`, { headers: admin }).then((r) => r.json());
  for (const f of u.factors ?? []) await fetch(`${api}/auth/v1/admin/users/${userId}/factors/${f.id}`, { method: "DELETE", headers: admin });
  const s = await passwordSession(api, anon, email, password);
  const f = await enrollTotp(api, anon, s.access_token, "E2E authenticator");
  const v = await verifyTotp(api, anon, s.access_token, f.id, f.secret);
  if (!v.session) throw new Error(`could not enroll the E2E factor for ${email}`);
  const ids = readIds();
  ids.totp = { ...(ids.totp ?? {}), [email]: f.secret };
  fs.writeFileSync("/tmp/nevout_e2e_ids.json", JSON.stringify(ids, null, 2), { mode: 0o600 });
  return f.secret;
}

/** Non-blocking: if the code screen is showing, type the current code once and submit. */
export async function answerMfaOnce(ev, email) {
  const secret = secretFor(email);
  if (!secret) return false;
  const showing = await ev(`!!document.querySelector('input[autocomplete="one-time-code"]') && !document.querySelector('input[autocomplete="one-time-code"]').dataset.e2eAnswered`);
  if (!showing) return false;
  await ev(`(() => {
    const i = document.querySelector('input[autocomplete="one-time-code"]');
    i.dataset.e2eAnswered = "1";
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(i, ${JSON.stringify(totp(secret))});
    i.dispatchEvent(new Event("input", { bubbles: true }));
    setTimeout(() => i.closest('form')?.requestSubmit(), 250);
    return 1;
  })()`);
  return true;
}
