#!/usr/bin/env node
// NevOut Meds — READ-ONLY account check for the pilot operator.
//
// Answers, without changing anything:
//   * does the account exist, is its email confirmed, has it ever signed in, is it suspended?
//   * which pharmacy is it in, with which role and status (as the SERVER records them)?
//   * that pharmacy's country, currency and business-day timezone
//   * who else is in the pharmacy, and which invitations are open
//
// Usage: node ops/provision/check-account.mjs --email owner@example.com [--json]
// Env:   NEVOUT_SUPABASE_URL, NEVOUT_SERVICE_ROLE_KEY_FILE (operator machine only)
// Prints no secrets, tokens or links. Exit 0 = found, 1 = not found / error.
import { client } from "../backup/supabase-admin.mjs";

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const email = (arg("email") || "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("--email is required and must be a valid address"); process.exit(64); }

const { call } = client();
const q = encodeURIComponent;

async function findUser(address) {
  for (let page = 1; page < 50; page++) {
    const res = await call("GET", `/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = res.users ?? res;
    const hit = users.find((u) => (u.email || "").toLowerCase() === address);
    if (hit || users.length < 200) return hit ?? null;
  }
  return null;
}

const user = await findUser(email);
if (!user) { console.log(`No account exists for ${email}.`); process.exit(1); }

const [profile] = await call("GET", `/rest/v1/users_profiles?select=pharmacy_id,role,status,name,joined_at&id=eq.${q(user.id)}`);
const pharmacy = profile?.pharmacy_id
  ? (await call("GET", `/rest/v1/pharmacies?select=name,country_code,default_currency,timezone,city&id=eq.${q(profile.pharmacy_id)}`))[0]
  : null;
const members = profile?.pharmacy_id
  ? await call("GET", `/rest/v1/users_profiles?select=name,email,role,status&pharmacy_id=eq.${q(profile.pharmacy_id)}&order=role,name`)
  : [];
const invitations = profile?.pharmacy_id
  ? await call("GET", `/rest/v1/staff_invitations?select=email,role,expires_at&pharmacy_id=eq.${q(profile.pharmacy_id)}&accepted_at=is.null&revoked_at=is.null&order=created_at`)
  : [];
const now = Date.now();

const report = {
  email,
  account: {
    email_confirmed: !!user.email_confirmed_at,
    has_signed_in: !!user.last_sign_in_at,
    suspended_login: !!(user.banned_until && new Date(user.banned_until).getTime() > now)
  },
  profile: profile ? { name: profile.name, role: profile.role, status: profile.status, joined_at: profile.joined_at } : null,
  pharmacy: pharmacy ? { name: pharmacy.name, country: pharmacy.country_code, currency: pharmacy.default_currency, timezone: pharmacy.timezone, city: pharmacy.city } : null,
  members: members.map((m) => ({ name: m.name, email: m.email, role: m.role, status: m.status })),
  open_invitations: invitations.map((i) => ({ email: i.email, role: i.role, expired: new Date(i.expires_at).getTime() < now }))
};

if (process.argv.includes("--json")) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const yes = (b) => (b ? "yes" : "no");
console.log(`Account ${email}`);
console.log(`  email confirmed: ${yes(report.account.email_confirmed)} · has signed in: ${yes(report.account.has_signed_in)} · login blocked (suspended): ${yes(report.account.suspended_login)}`);
if (!report.profile?.role || !report.pharmacy) {
  console.log("  pharmacy: none yet — the owner has not finished onboarding, or the staff member has not accepted an invitation");
} else {
  console.log(`  pharmacy: ${report.pharmacy.name} (${report.pharmacy.city || "city not set"}) · ${report.pharmacy.country} · ${report.pharmacy.currency} · business day ${report.pharmacy.timezone}`);
  console.log(`  role: ${report.profile.role} · status: ${report.profile.status}`);
  console.log(`  members (${report.members.length}):`);
  for (const m of report.members) console.log(`    - ${m.name || "(no name)"} <${m.email}> ${m.role} · ${m.status}`);
  if (report.open_invitations.length) {
    console.log(`  open invitations (${report.open_invitations.length}):`);
    for (const i of report.open_invitations) console.log(`    - ${i.email} ${i.role}${i.expired ? " · EXPIRED (resend from Staff)" : ""}`);
  }
}
