#!/usr/bin/env node
// NevOut Meds — CONTROLLED-PILOT fallback: provision a pharmacy owner's account
// without email delivery (while production SMTP is not configured).
//
// It does NOT weaken authentication:
//   * email confirmation stays enabled for everyone else; nothing global changes
//   * the operator never chooses, sees or sends a password
//   * the account is marked email-confirmed only because the OPERATOR has
//     verified the owner's identity and address out of band (in person / call)
//   * the owner receives a single-use password-setup link that expires
//     (the project's OTP expiry, 1 hour by default) over a channel the operator
//     has verified (e.g. WhatsApp to the number checked in person)
//   * the account alone grants nothing: the owner still creates their pharmacy
//     through normal onboarding, and staff still join only via owner invitations
//
// Usage:
//   node ops/provision/provision-owner.mjs --email owner@example.com --name "Full Name" --app-url https://nevout-meds-liberia-pilot.vercel.app [--yes]
//   node ops/provision/provision-owner.mjs --email owner@example.com --app-url <url> --new-link --yes
//        (only for an owner who has not yet set a password or created a pharmacy)
//   ... --for staff   for a staff member the owner has ALREADY invited in the app: the
//        account gets no role here — after choosing a password they open the
//        owner's invitation link and choose "I have an account"; the invitation
//        (validated server-side) decides their pharmacy and role.
// Env: NEVOUT_SUPABASE_URL, NEVOUT_SERVICE_ROLE_KEY_FILE (service role — operator machine only)
// Every run is appended to ops/provision/provision.log (no links, no secrets).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { client } from "../backup/supabase-admin.mjs";

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name) => process.argv.includes(`--${name}`);
const email = (arg("email") || "").trim().toLowerCase();
const name = (arg("name") || "").trim();
const appUrl = (arg("app-url") || process.env.NEVOUT_APP_URL || "").replace(/\/$/, "");
const newLink = flag("new-link");
const forStaff = arg("for") === "staff";
const LOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "provision.log");
const audit = (event, extra = {}) => fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), operator: os.userInfo().username, event, email, ...extra }) + "\n", { mode: 0o600 });

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("--email is required and must be a valid address"); process.exit(64); }
if (!/^https?:\/\/[^/]+$/.test(appUrl)) { console.error("--app-url must be the app origin, e.g. https://nevout-meds-liberia-pilot.vercel.app"); process.exit(64); }
if (!newLink && name.length < 2) { console.error("--name is required"); process.exit(64); }

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

const existing = await findUser(email);
if (existing && !newLink) {
  console.error(`An account for ${email} already exists. If they have used it, they should sign in or use "Forgot password" once SMTP is live; if they never set a password, re-run with --new-link.`);
  audit("refused_existing");
  process.exit(1);
}
if (newLink) {
  if (!existing) { console.error(`No account exists for ${email}.`); process.exit(1); }
  const profile = await call("GET", `/rest/v1/users_profiles?select=id&id=eq.${existing.id}`);
  if ((Array.isArray(profile) && profile.length) || existing.last_sign_in_at) {
    console.error(`${email} has already signed in or belongs to a pharmacy. A new setup link is not issued for active accounts.`);
    audit("refused_active_account");
    process.exit(1);
  }
}

console.log(`About to ${newLink ? "issue a new password-setup link for" : (forStaff ? "create a staff account for" : "create an owner account for")} ${email}${name ? ` (${name})` : ""}.`);
console.log("Confirm you have verified this person's identity and email address in person or by a call you initiated.");
if (!flag("yes")) { console.log("Re-run with --yes to proceed."); process.exit(0); }

let userId = existing?.id;
if (!existing) {
  const created = await call("POST", "/auth/v1/admin/users", {
    body: { email, email_confirm: true, user_metadata: { name, provisioned_by: "operator", provisioned_for: forStaff ? "staff-invitation" : "owner" } }
  });
  userId = created.id ?? created.user?.id;
  audit("account_created", { user_id: userId, for: forStaff ? "staff" : "owner" });
}

const link = await call("POST", "/auth/v1/admin/generate_link", {
  body: { type: "recovery", email, redirect_to: `${appUrl}/reset-password` }
});
const action = link.action_link ?? link.properties?.action_link;
if (!action) { console.error("The auth server did not return a setup link."); audit("link_failed"); process.exit(1); }
audit("setup_link_issued", { user_id: userId });

console.log("\nPassword-setup link (single use; expires with the project's OTP expiry, 1 hour by default):\n");
console.log(action);
console.log(`
Send it ONLY over the channel you verified (e.g. WhatsApp to the number you checked).
Do not paste it into group chats, email threads or tickets.`);
if (forStaff) {
  console.log(`Tell the staff member:
  1. Open this link on their own phone and choose their own password (8+ characters).
  2. Do NOT set up a new pharmacy. Instead open the invitation link their pharmacy owner sent,
     choose "I have an account" and sign in — the invitation adds them to the pharmacy.
If the link expires, re-run with --new-link --for staff.`);
} else {
  console.log(`Tell the owner:
  1. Open the link on the phone or computer they will use.
  2. Choose their own password (8+ characters) and tap "Open your workspace".
  3. Set up the pharmacy: country, currency, name, contact.
If the link expires, re-run with --new-link.`);
}
