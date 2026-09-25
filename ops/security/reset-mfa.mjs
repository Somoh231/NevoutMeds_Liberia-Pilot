#!/usr/bin/env node
// NevOut Meds — supervised two-step verification reset (Phase 11).
//
// For the case the app cannot handle itself: a pharmacy OWNER (or a platform
// admin) has lost their authenticator. Staff are reset by their own owner in
// the app (Staff → Reset two-step), never with this tool.
//
// Procedure (docs/security/MFA_OPERATIONS.md §4): the operator verifies the
// person's identity OUT OF BAND first — in person, or by calling back a number
// already on file for that pharmacy — and records a support ticket. Then:
//
//   node ops/security/reset-mfa.mjs --email owner@example.com --ticket SUP-123 \
//        --verified-by "callback to number on file" [--yes]
//
// What it does (with --yes):
//   * deletes the person's MFA factors through the Supabase Auth admin API
//     (the only supported way; secrets are never read or printed);
//   * any session still open elsewhere (e.g. on a lost phone) drops to aal1 at
//     its next token refresh (within the 1-hour token lifetime) and then reaches
//     no pharmacy data, because the role still requires a second factor;
//   * records an append-only security event (actor = operator) that the
//     pharmacy owner sees in Account security → Security activity;
//   * appends a line to ops/security/security-ops.log (gitignored).
// At their next sign-in the person sets up a new authenticator before the
// workspace opens (their role still requires it).
//
// Env: NEVOUT_SUPABASE_URL, NEVOUT_SERVICE_ROLE_KEY_FILE (chmod 600; operator machine only).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { client } from "../backup/supabase-admin.mjs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (n) => process.argv.includes(`--${n}`);
const email = (arg("email") || "").trim().toLowerCase();
const ticket = (arg("ticket") || "").trim();
const verifiedBy = (arg("verified-by") || "").trim();
const LOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "security-ops.log");
const audit = (event, extra = {}) =>
  fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), operator: os.userInfo().username, event, email, ticket, ...extra }) + "\n", { mode: 0o600 });

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("--email is required"); process.exit(64); }
if (ticket.length < 3) { console.error("--ticket is required (the support reference for this request)"); process.exit(64); }
if (verifiedBy.length < 5) { console.error('--verified-by is required, e.g. "in person with ID" or "callback to number on file"'); process.exit(64); }

const { call } = client();

async function findUser(address) {
  for (let page = 1; page < 50; page++) {
    const res = await call("GET", `/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = res.users ?? res;
    const hit = users.find((u) => (u.email || "").toLowerCase() === address);
    if (hit || users.length < 200) return hit ?? null;
  }
  return null;
}

const listed = await findUser(email);
if (!listed) { console.error(`No account for ${email}.`); process.exit(1); }
// The list endpoint omits factors; the single-user record includes them.
const user = await call("GET", `/auth/v1/admin/users/${listed.id}`);
const [profile] = (await call("GET", `/rest/v1/users_profiles?select=role,status,pharmacy_id,name&id=eq.${user.id}`)) ?? [];
const pharmacy = profile?.pharmacy_id ? ((await call("GET", `/rest/v1/pharmacies?select=name&id=eq.${profile.pharmacy_id}`)) ?? [])[0] : null;
const factors = (user.factors ?? []).filter((f) => f.factor_type === "totp");

console.log(`Account:   ${email}`);
console.log(`Name:      ${profile?.name ?? "(no profile)"}`);
console.log(`Role:      ${profile?.role ?? "-"} · status ${profile?.status ?? "-"}`);
console.log(`Pharmacy:  ${pharmacy?.name ?? "-"}`);
console.log(`Factors:   ${factors.length} (${factors.map((f) => f.status).join(", ") || "none"})`);
console.log(`Ticket:    ${ticket} · identity verified by: ${verifiedBy}`);
if (profile?.role === "staff") {
  console.error("\nThis person is staff: their pharmacy owner resets it in the app (Staff → Reset two-step). Refusing.");
  audit("mfa_reset_refused_staff");
  process.exit(1);
}
if (profile?.status && profile.status !== "active") {
  console.error(`\nThis account is ${profile.status}. Do not restore access through an MFA reset. Refusing.`);
  audit("mfa_reset_refused_status", { status: profile.status });
  process.exit(1);
}
if (factors.length === 0) { console.log("\nNothing to reset: the account has no authenticator."); process.exit(0); }
if (!flag("yes")) { console.log("\nRe-run with --yes to reset."); process.exit(0); }

let removed = 0;
for (const f of factors) {
  await call("DELETE", `/auth/v1/admin/users/${user.id}/factors/${f.id}`);
  removed++;
}
await call("POST", "/rest/v1/security_events", {
  headers: { Prefer: "return=minimal" },
  body: {
    pharmacy_id: profile?.pharmacy_id ?? null,
    user_id: user.id,
    actor: "operator",
    event: "mfa_admin_reset",
    detail: { ticket, verified_by: verifiedBy, operator: os.userInfo().username, factors_removed: removed }
  }
});
audit("mfa_reset", { factors_removed: removed, role: profile?.role ?? null });
console.log(`\nDone: ${removed} authenticator(s) removed and the reset recorded. At next sign-in they set up a new app.`);
