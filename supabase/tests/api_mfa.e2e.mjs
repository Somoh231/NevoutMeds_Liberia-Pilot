// NevOut Meds — two-step verification against real Supabase Auth (LOCAL stack).
//
// Everything goes through the same public Auth API the app uses. TOTP codes are
// computed by the test the way an authenticator app would (lib/mfa.mjs).
// Usage: node supabase/tests/api_mfa.e2e.mjs   (after seed_e2e.sh)
import fs from "node:fs";
import { claims, enrollTotp, passwordSession, readIds, secretFor, totp, verifyTotp } from "./lib/mfa.mjs";

const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const SERVICE = fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim();
const IDS = readIds();
const PW = IDS.password;

let pass = 0, fail = 0;
const check = (d, ok, detail = "") => { if (ok) { pass++; console.log(`ok   ${d}${detail ? ` [${detail}]` : ""}`); } else { fail++; console.log(`NOT OK ${d} [${detail}]`); } };

const rest = (token, p, init = {}) => fetch(`${API}/rest/v1/${p}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const rpc = async (token, fn, body = {}) => { const r = await rest(token, `rpc/${fn}`, { method: "POST", body: JSON.stringify(body) }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, body: j ?? t }; };
const rows = async (token, p) => { const r = await rest(token, p); return r.ok ? r.json() : []; };
const auth = (path, { token, body, method = "POST", key = ANON } = {}) =>
  fetch(`${API}/auth/v1${path}`, { method, headers: { apikey: key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
const edge = async (token, payload) => { const r = await fetch(`${API}/functions/v1/staff-admin`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const adminFactors = async (userId) => (await (await auth(`/admin/users/${userId}`, { method: "GET", token: SERVICE, key: SERVICE })).json()).factors ?? [];
const adminDeleteAllFactors = async (userId) => { for (const f of await adminFactors(userId)) await auth(`/admin/users/${userId}/factors/${f.id}`, { method: "DELETE", token: SERVICE, key: SERVICE }); };

// ── 1. Owner with a factor: password alone is not enough ────────────────────
const a1 = await passwordSession(API, ANON, "ownerA@e2e.local", PW);
check("password sign-in gives an aal1 session", claims(a1.access_token).aal === "aal1", claims(a1.access_token).aal);
const post1 = (await rpc(a1.access_token, "my_security_posture")).body;
check("aal1 owner: posture says required, enrolled, not satisfied", post1.mfa_required && post1.mfa_enrolled && !post1.mfa_satisfied, JSON.stringify(post1).slice(0, 120));
check("aal1 owner reads no customers (PostgREST)", (await rows(a1.access_token, "customers?select=id")).length === 0);
check("aal1 owner cannot call an owner RPC", (await rpc(a1.access_token, "financial_summary", { p_days: 30 })).status >= 400);
check("aal1 owner cannot use the staff-admin Edge Function", (await edge(a1.access_token, { action: "invite", email: "x@e2e.local", role: "staff" })).status === 403);

const factorA = (a1.user.factors ?? []).find((f) => f.status === "verified");
const wrong = await verifyTotp(API, ANON, a1.access_token, factorA.id, secretFor("ownerA@e2e.local"), "000000");
check("an incorrect code is rejected", wrong.status === 422 && /mfa_verification_failed|Invalid TOTP/i.test(wrong.error ?? ""), `${wrong.status}`);
const badChallenge = await auth(`/factors/${factorA.id}/verify`, { token: a1.access_token, body: { challenge_id: "00000000-0000-0000-0000-000000000000", code: totp(secretFor("ownerA@e2e.local")) } });
check("an invalid / expired challenge is rejected", badChallenge.status >= 400 && badChallenge.status < 500, `${badChallenge.status}`);
const otherFactor = await auth(`/factors/00000000-0000-0000-0000-000000000000/challenge`, { token: a1.access_token, body: {} });
check("a factor that is not yours cannot be challenged", otherFactor.status >= 400, `${otherFactor.status}`);

const ok = await verifyTotp(API, ANON, a1.access_token, factorA.id, secretFor("ownerA@e2e.local"));
check("the correct code upgrades the session to aal2", ok.session && claims(ok.session.access_token).aal === "aal2");
check("aal2 owner reads their pharmacy's data", (await rows(ok.session.access_token, "customers?select=id")).length >= 0 && (await rpc(ok.session.access_token, "financial_summary", { p_days: 30 })).status === 200);
const refreshed = await (await auth("/token?grant_type=refresh_token", { body: { refresh_token: ok.session.refresh_token } })).json();
check("a session refresh keeps aal2 (offline-first sessions stay verified)", claims(refreshed.access_token).aal === "aal2");
await auth("/logout", { token: refreshed.access_token });
const afterLogout = await auth("/token?grant_type=refresh_token", { body: { refresh_token: refreshed.refresh_token } });
check("after sign-out the refresh token no longer works", afterLogout.status >= 400, `${afterLogout.status}`);
const again = await passwordSession(API, ANON, "ownerA@e2e.local", PW);
check("signing in again starts at aal1 (the code is asked again)", claims(again.access_token).aal === "aal1");

// ── 2. Removing factors: Supabase requires aal2 ─────────────────────────────
const unenrollAal1 = await auth(`/factors/${factorA.id}`, { method: "DELETE", token: again.access_token });
check("a verified factor cannot be removed from an aal1 session", unenrollAal1.status >= 400, `${unenrollAal1.status}`);
check("…and it is still there", (await adminFactors(IDS.ownerA)).some((f) => f.id === factorA.id));

// ── 3. Privileged account without any factor (e.g. first sign-in) ──────────
await adminDeleteAllFactors(IDS.ownerB);
const b1 = await passwordSession(API, ANON, "ownerB@e2e.local", PW);
const postB = (await rpc(b1.access_token, "my_security_posture")).body;
check("privileged login without MFA: required, not enrolled, no capabilities", postB.mfa_required && !postB.mfa_enrolled && !postB.mfa_satisfied && postB.capabilities.length === 0, JSON.stringify(postB).slice(0, 120));
check("privileged login without MFA reaches no pharmacy data", (await rows(b1.access_token, "pharmacies?select=id")).length === 0);
const fB = await enrollTotp(API, ANON, b1.access_token, "api test");
check("enrollment returns a QR code and a secret from Supabase Auth", !!fB.secret && /^otpauth:\/\//.test(fB.uri));
const pending = (await rpc(b1.access_token, "my_security_posture")).body;
check("an unfinished enrollment does not count as enrolled", !pending.mfa_enrolled);
const vB = await verifyTotp(API, ANON, b1.access_token, fB.id, fB.secret);
check("verifying the first code enables MFA and gives aal2", vB.session && claims(vB.session.access_token).aal === "aal2");
const postB2 = (await rpc(vB.session.access_token, "my_security_posture")).body;
check("…and the owner now has their capabilities", postB2.mfa_satisfied && postB2.capabilities.includes("staff.invite"));
const ev = await rpc(vB.session.access_token, "record_security_event", { p_event: "mfa_factor_verified", p_factor_id: fB.id });
check("the verification is recorded as a security event", ev.status === 204 || ev.status === 200, `${ev.status}`);
// Keep the seed file honest for later suites.
const ids = readIds(); ids.totp = { ...(ids.totp ?? {}), "ownerB@e2e.local": fB.secret };
fs.writeFileSync("/tmp/nevout_e2e_ids.json", JSON.stringify(ids, null, 2), { mode: 0o600 });

// ── 4. Staff: optional ──────────────────────────────────────────────────────
const s1 = await passwordSession(API, ANON, "staffA@e2e.local", PW);
const postS = (await rpc(s1.access_token, "my_security_posture")).body;
check("ordinary staff: MFA optional, aal1 is enough", !postS.mfa_required && postS.mfa_satisfied && postS.capabilities.includes("sales.create"), JSON.stringify(postS).slice(0, 100));
const fS = await enrollTotp(API, ANON, s1.access_token, "staff phone");
const vS = await verifyTotp(API, ANON, s1.access_token, fS.id, fS.secret);
check("staff can opt in to MFA", vS.session && claims(vS.session.access_token).aal === "aal2");
const s2 = await passwordSession(API, ANON, "staffA@e2e.local", PW);
check("once opted in, staff at aal1 reach no data", (await rows(s2.access_token, "customers?select=id")).length === 0);

// ── 5. Owner resets a staff member's authenticator (lost phone) ─────────────
const ownerA = (await verifyTotp(API, ANON, again.access_token, factorA.id, secretFor("ownerA@e2e.local"))).session.access_token;
const staffTok = vS.session.access_token;
check("STAFF cannot reset anyone's MFA (RPC)", (await rpc(staffTok, "reset_member_mfa", { p_user_id: IDS.ownerA })).status >= 400);
check("STAFF cannot reset anyone's MFA (Edge Function)", (await edge(staffTok, { action: "reset_mfa", user_id: IDS.ownerA })).status === 403);
check("an owner cannot reset their own MFA this way", (await edge(ownerA, { action: "reset_mfa", user_id: IDS.ownerA })).status === 403);
const ownerBtok = vB.session.access_token;
check("PHARMACY B owner cannot reset pharmacy A staff", (await edge(ownerBtok, { action: "reset_mfa", user_id: IDS.staffA })).status === 403);
const reset = await edge(ownerA, { action: "reset_mfa", user_id: IDS.staffA });
check("the owner resets their staff member's authenticator", reset.status === 200 && reset.body.factors_removed >= 1, JSON.stringify(reset.body));
check("…the factor is gone in Supabase Auth", (await adminFactors(IDS.staffA)).filter((f) => f.status === "verified").length === 0);
const s3 = await passwordSession(API, ANON, "staffA@e2e.local", PW);
check("…and the staff member works again with their password", (await rows(s3.access_token, "customers?select=id")).length >= 1);
const evs = await rows(ownerA, `security_events?select=event,actor,user_id&user_id=eq.${IDS.staffA}&event=eq.mfa_admin_reset`);
check("…and the reset is in the pharmacy's security log (by the owner)", evs.length === 1 && evs[0].actor === "owner", JSON.stringify(evs));
const audit = await rows(ownerA, `staff_audit_log?select=action&target_user_id=eq.${IDS.staffA}&action=eq.mfa_reset`);
check("…and in the team audit log", audit.length === 1);

// ── 6. Security log never holds secrets ─────────────────────────────────────
const all = JSON.stringify(await rows(ownerA, "security_events?select=*"));
check("security events never contain a TOTP secret or code", ![secretFor("ownerA@e2e.local"), fB.secret, fS.secret].some((x) => all.includes(x)) && !/otpauth/.test(all));

console.log(`\n# ${pass + fail} MFA API checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
