// NevOut Meds — NV-LEAD-01a validation probe (LOCAL stack only; see SECURITY_FINDINGS_REGISTER.md).
//
// Shows what a restore from a backup artifact does to two-step verification:
// backup-db.sh dumps auth.users + auth.identities but never auth.mfa_factors, so a
// restored owner has no factor and a password-only session can enrol one of its own.
// It mutates the synthetic e2e fixtures (deletes ownerA's factors): re-seed afterwards
// with supabase/tests/seed_e2e.sh. Prints no secrets, tokens or TOTP seeds.
//
// Usage: node supabase/tests/probes/lead01_restore_mfa.probe.mjs   (after seed_e2e.sh)
import fs from "node:fs"; import { execFileSync } from "node:child_process";
import { claims, enrollTotp, passwordSession, readIds, verifyTotp } from "../lib/mfa.mjs";
const API = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API)) { console.error("refusing to run against a non-local API"); process.exit(2); }
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim(); const IDS = readIds(); const PW = IDS.password;
const C = process.env.NEVOUT_DB_CONTAINER || "supabase_db_NevOutMeds_Liberia_Pilot";
const sql = (q) => execFileSync("docker", ["exec", C, "psql", "-U", "postgres", "-d", "postgres", "-XAtc", q]).toString().trim();
const rpc = async (tok, fn) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: "{}" }); return { status: r.status, body: await r.json().catch(() => null) }; };
const log = (k, v) => console.log(`${k}: ${v}`);
const email = "ownerA@e2e.local";
const uid = sql(`select id from auth.users where email = '${email.toLowerCase()}'`);

// 1. What a backup artifact holds for auth (the exact pg engine command in backup-db.sh)
const dump = execFileSync("docker", ["exec", C, "pg_dump", "-U", "postgres", "-d", "postgres", "--data-only", "--no-owner", "--table=auth.users", "--table=auth.identities"]).toString();
log("source: verified factors for the owner", sql(`select count(*) from auth.mfa_factors where user_id = '${uid}' and status = 'verified'`));
log("artifact data-auth.sql mentions auth.mfa_factors", /mfa_factors/.test(dump));
log("artifact data-auth.sql contains the owner's user row", dump.includes(uid));

// 2. Before restore: password alone
let s = await passwordSession(API, ANON, email, PW);
log("before: password session aal", claims(s.access_token).aal);
let p = (await rpc(s.access_token, "my_security_posture")).body;
log("before: posture enrolled/satisfied/capabilities", `${p.mfa_enrolled}/${p.mfa_satisfied}/${p.capabilities.length}`);
const r = await fetch(`${API}/auth/v1/factors`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ factor_type: "totp", friendly_name: "attacker-before" }) });
log("before: enrolling a NEW factor from the aal1 session -> HTTP", r.status);
if (r.ok) { const f = await r.json(); sql(`delete from auth.mfa_factors where id = '${f.id}'`); }

// 3. Simulate the restored state: the artifact has no factor rows, so the restored owner has none.
sql(`delete from auth.mfa_factors where user_id = '${uid}'`);
log("restored-state: factors for the owner", sql(`select count(*) from auth.mfa_factors where user_id = '${uid}'`));

// 4. Password holder only (no authenticator): sign in, enrol own factor, verify
s = await passwordSession(API, ANON, email, PW);
p = (await rpc(s.access_token, "my_security_posture")).body;
log("after: aal1 posture required/enrolled/capabilities", `${p.mfa_required}/${p.mfa_enrolled}/${p.capabilities.length}`);
const f = await enrollTotp(API, ANON, s.access_token, "attacker-after");
const v = await verifyTotp(API, ANON, s.access_token, f.id, f.secret);
log("after: attacker enrolment + verify -> HTTP", v.status);
const aal2 = v.session?.access_token;
log("after: resulting session aal", aal2 ? claims(aal2).aal : "none");
if (aal2) { p = (await rpc(aal2, "my_security_posture")).body; log("after: posture satisfied/capabilities", `${p.mfa_satisfied}/${p.capabilities.length} (${p.capabilities.slice(0, 4).join(",")}…)`); }
