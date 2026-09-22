// NevOut Meds — Phase 4 API tests.
//
// Everything here goes through the real production path: GoTrue for
// authentication (no injected or hand-minted user sessions), the staff-admin
// Edge Function for privileged actions, and PostgREST for data.
//
// Prerequisites: supabase/tests/seed_e2e.sh has been run.
import fs from "node:fs";

const BASE = process.env.NEVOUT_API_URL || "http://127.0.0.1:55421";
const ANON = fs.readFileSync("/tmp/nevout_anon.jwt", "utf8").trim();
const SERVICE = fs.readFileSync("/tmp/nevout_service.jwt", "utf8").trim();
const IDS = JSON.parse(fs.readFileSync("/tmp/nevout_e2e_ids.json", "utf8"));
const PASSWORD = IDS.password;

let pass = 0, fail = 0;
const check = (desc, ok, detail) => {
  if (ok) { pass++; console.log(`ok   ${desc}${detail ? ` [${detail}]` : ""}`); }
  else { fail++; console.log(`NOT OK ${desc} [${detail}]`); }
};

async function login(email, password = PASSWORD) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  return { status: r.status, body: await r.json() };
}
const rest = async (token, path, init = {}) => {
  const r = await fetch(BASE + path, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
};
const fn = async (token, payload) => {
  const r = await fetch(`${BASE}/functions/v1/staff-admin`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
};
const admin = async (path, init = {}) => {
  const r = await fetch(`${BASE}/auth/v1${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  let body; try { body = await r.json(); } catch { body = null; }
  return { status: r.status, body };
};

// ── 1. Real authentication through GoTrue ───────────────────────────────────
let r = await login("ownerA@e2e.local");
check("real email/password login succeeds through GoTrue + Kong", r.status === 200 && !!r.body.access_token, `${r.status}`);
const ownerToken = r.body.access_token;
const ownerRefresh = r.body.refresh_token;

r = await login("ownerA@e2e.local", "WrongPassword!");
check("invalid credentials are rejected", r.status >= 400 && !r.body.access_token, `${r.status} ${r.body.error_code || r.body.msg || ""}`);

r = await login("nobody@e2e.local");
check("unknown account is rejected", r.status >= 400, `${r.status}`);

// Session restoration via refresh token (what the browser does after a reload).
r = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ refresh_token: ownerRefresh })
});
const refreshed = await r.json();
check("session can be refreshed", r.status === 200 && !!refreshed.access_token, `${r.status}`);

// Password recovery through the real endpoint.
r = await fetch(`${BASE}/auth/v1/recover`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "ownerA@e2e.local" })
});
check("password reset can be requested", r.status === 200, `${r.status}`);

// A token is required at all.
r = await rest("not-a-token", "/rest/v1/customers?select=id");
check("a malformed token is refused", r.status >= 400, `${r.status}`);

const staffLogin = await login("staffA@e2e.local");
const staffToken = staffLogin.body.access_token;
check("staff can sign in", staffLogin.status === 200 && !!staffToken, `${staffLogin.status}`);
const ownerBLogin = await login("ownerB@e2e.local");
const ownerBToken = ownerBLogin.body.access_token;

// ── 2. Invitations through the Edge Function ────────────────────────────────
const inviteEmail = `invitee${Date.now()}@e2e.local`;

r = await fn(staffToken, { action: "invite", email: `staffinvite${Date.now()}@e2e.local`, role: "staff" });
check("staff cannot invite anyone", r.status >= 400, `${r.status} ${r.body?.error || ""}`);

r = await fn(ownerToken, { action: "invite", email: `evil${Date.now()}@e2e.local`, role: "admin" });
check("owner cannot invite a platform admin", r.status >= 400, `${r.status} ${r.body?.error || ""}`);

r = await fn(ownerToken, { action: "invite", email: inviteEmail, name: "New Teammate", role: "staff" });
check("owner can invite staff to their own pharmacy", r.status === 200 && !!r.body?.accept_url, `${r.status} ${r.body?.error || ""}`);
const acceptUrl = r.body?.accept_url ?? "";
const inviteToken = new URL(acceptUrl).searchParams.get("token");
const invitationId = r.body?.invitation_id;
check("invitation link points at an allowed application origin",
  /^http:\/\/127\.0\.0\.1:(4173|4178|5173)\//.test(acceptUrl) || /^http:\/\/localhost:5173\//.test(acceptUrl), acceptUrl.slice(0, 60));

r = await fn(ownerToken, { action: "invite", email: inviteEmail, role: "staff", app_origin: "https://evil.example.com" });
check("an untrusted redirect origin is ignored (no open redirect)",
  r.status === 200 && !String(r.body?.accept_url).includes("evil.example.com"), String(r.body?.accept_url).slice(0, 60));
const liveToken = new URL(r.body.accept_url).searchParams.get("token");

r = await rest(ownerBToken, `/rest/v1/staff_invitations?select=id,email`);
check("another pharmacy cannot see these invitations",
  r.status === 200 && !(r.body ?? []).some((i) => i.email === inviteEmail), `n=${r.body?.length}`);

// ── 3. Acceptance with a real account ───────────────────────────────────────
// inviteUserByEmail() already created this identity, exactly as it would in
// production; the invitee sets their password from the email link. Here we set
// it through the admin API so the test can sign in as them.
let inviteeId = null;
{
  const list = await admin(`/admin/users?per_page=200`);
  inviteeId = (list.body?.users ?? []).find((u) => u.email === inviteEmail)?.id ?? null;
}
check("invitation created the auth identity", !!inviteeId, `id=${inviteeId}`);
const created = inviteeId
  ? await admin(`/admin/users/${inviteeId}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD, email_confirm: true }) })
  : { status: 0, body: null };
check("invitee has a usable password", created.status === 200, `${created.status} ${created.body?.msg || ""}`);
const inviteeLogin = await login(inviteEmail);
const inviteeToken = inviteeLogin.body.access_token;
check("invitee can sign in before accepting", inviteeLogin.status === 200 && !!inviteeToken, `${inviteeLogin.status}`);

r = await rest(inviteeToken, "/rest/v1/customers?select=id");
check("invitee sees no pharmacy data before accepting", r.status === 200 && (r.body ?? []).length === 0, `n=${r.body?.length}`);

r = await rest(staffToken, "/rest/v1/rpc/accept_staff_invitation", { method: "POST", body: JSON.stringify({ p_token: liveToken }) });
check("an existing member cannot consume the invitation", r.status >= 400, `${r.status} ${r.body?.message || ""}`);

r = await rest(inviteeToken, "/rest/v1/rpc/accept_staff_invitation", { method: "POST", body: JSON.stringify({ p_token: "deadbeef" }) });
check("a wrong token is rejected", r.status >= 400, `${r.status} ${r.body?.message || ""}`);

r = await rest(inviteeToken, "/rest/v1/rpc/accept_staff_invitation", { method: "POST", body: JSON.stringify({ p_token: liveToken }) });
check("invitee accepts the invitation", r.status === 200 && r.body?.pharmacy_id === IDS.pharmacyA, `${r.status} ${r.body?.message || ""}`);

r = await rest(inviteeToken, "/rest/v1/rpc/accept_staff_invitation", { method: "POST", body: JSON.stringify({ p_token: liveToken }) });
check("the invitation is single-use", r.status >= 400, `${r.status} ${r.body?.message || ""}`);

r = await rest(inviteeToken, "/rest/v1/users_profiles?select=pharmacy_id,role,status&id=eq." + inviteeId);
check("accepted staff receives the correct pharmacy and role",
  r.body?.[0]?.pharmacy_id === IDS.pharmacyA && r.body?.[0]?.role === "staff" && r.body?.[0]?.status === "active",
  JSON.stringify(r.body?.[0] ?? {}));

r = await rest(inviteeToken, "/rest/v1/customers?select=id,pharmacy_id");
check("accepted staff now works inside pharmacy A only",
  r.status === 200 && r.body.length > 0 && r.body.every((c) => c.pharmacy_id === IDS.pharmacyA), `n=${r.body?.length}`);

// Self-service escalation attempts, over the real API.
r = await rest(inviteeToken, `/rest/v1/users_profiles?id=eq.${inviteeId}`, { method: "PATCH", body: JSON.stringify({ role: "owner" }) });
check("accepted staff cannot promote themselves", r.status >= 400, `${r.status}`);
r = await rest(inviteeToken, `/rest/v1/users_profiles?id=eq.${inviteeId}`, { method: "PATCH", body: JSON.stringify({ pharmacy_id: IDS.pharmacyB }) });
check("accepted staff cannot move to another pharmacy", r.status >= 400, `${r.status}`);
r = await fn(inviteeToken, { action: "set_role", user_id: inviteeId, role: "owner" });
check("accepted staff cannot use the admin function to promote themselves", r.status >= 400, `${r.status} ${r.body?.error || ""}`);

// Cross-tenant: pharmacy B owner may not touch pharmacy A's people.
r = await fn(ownerBToken, { action: "suspend", user_id: inviteeId });
check("another pharmacy's owner cannot suspend this user", r.status >= 400, `${r.status} ${r.body?.error || ""}`);
r = await fn(ownerBToken, { action: "revoke", invitation_id: invitationId });
check("another pharmacy's owner cannot revoke this invitation", r.status >= 400, `${r.status} ${r.body?.error || ""}`);

// ── 4. Suspension with a live session ───────────────────────────────────────
// Record something first, so attribution can be checked after offboarding.
r = await rest(inviteeToken, "/rest/v1/rpc/record_purchase", {
  method: "POST",
  body: JSON.stringify({ p_pharmacy_id: IDS.pharmacyA, p_customer_id: "cccccccc-0000-0000-0000-00000000000a", p_method: "Cash", p_staff_id: inviteeId, p_items: [{ product_id: "dddddddd-0000-0000-0000-00000000000a", name: "Para A", qty: 1, unit_price: 2 }] })
});
check("new staff records a purchase", r.status === 200, `${r.status} ${r.body?.message || ""}`);
const purchaseId = r.body;

r = await fn(ownerToken, { action: "suspend", user_id: inviteeId });
check("owner suspends the staff member", r.status === 200, `${r.status} ${r.body?.error || ""}`);

// Same token as before — no re-login.
r = await rest(inviteeToken, "/rest/v1/customers?select=id");
check("suspended user's existing session can no longer read data", r.status === 200 && (r.body ?? []).length === 0, `n=${r.body?.length}`);
r = await rest(inviteeToken, "/rest/v1/rpc/record_purchase", {
  method: "POST",
  body: JSON.stringify({ p_pharmacy_id: IDS.pharmacyA, p_customer_id: "cccccccc-0000-0000-0000-00000000000a", p_method: "Cash", p_staff_id: null, p_items: [{ name: "x", qty: 1, unit_price: 1 }] })
});
check("suspended user cannot record a purchase with a cached session", r.status >= 400, `${r.status}`);

r = await login(inviteEmail);
check("suspended user cannot sign in again", r.status >= 400, `${r.status} ${r.body?.error_code || ""}`);

r = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ refresh_token: inviteeLogin.body.refresh_token })
});
check("suspended user cannot refresh their session", r.status >= 400, `${r.status}`);

// ── 5. Reactivation and offboarding ─────────────────────────────────────────
r = await fn(ownerToken, { action: "reactivate", user_id: inviteeId });
check("owner reactivates the staff member", r.status === 200, `${r.status} ${r.body?.error || ""}`);
const back = await login(inviteEmail);
check("reactivated user can sign in again", back.status === 200 && !!back.body.access_token, `${back.status}`);
r = await rest(back.body.access_token, "/rest/v1/customers?select=id");
check("reactivated user can read pharmacy data again", r.status === 200 && (r.body ?? []).length > 0, `n=${r.body?.length}`);

r = await fn(ownerToken, { action: "remove", user_id: inviteeId });
check("owner offboards the staff member", r.status === 200, `${r.status} ${r.body?.error || ""}`);
r = await rest(back.body.access_token, "/rest/v1/customers?select=id");
check("offboarded user loses access immediately", r.status === 200 && (r.body ?? []).length === 0, `n=${r.body?.length}`);
r = await login(inviteEmail);
check("offboarded user cannot sign in", r.status >= 400, `${r.status}`);

r = await rest(ownerToken, `/rest/v1/purchases?id=eq.${purchaseId}&select=id,staff_id`);
check("historical purchase keeps its attribution after offboarding",
  r.body?.[0]?.staff_id === inviteeId, JSON.stringify(r.body?.[0] ?? {}));
r = await rest(ownerToken, `/rest/v1/users_profiles?id=eq.${inviteeId}&select=status,name`);
check("offboarded profile is preserved, not deleted", r.body?.[0]?.status === "removed", JSON.stringify(r.body?.[0] ?? {}));

// ── 6. Audit trail ──────────────────────────────────────────────────────────
r = await rest(ownerToken, "/rest/v1/staff_audit_log?select=action,target_email,created_at&order=created_at.desc&limit=20");
const actions = (r.body ?? []).map((a) => a.action);
check("audit log records the whole lifecycle",
  ["invitation_created", "invitation_accepted", "user_suspended", "user_reactivated", "user_removed"].every((a) => actions.includes(a)),
  actions.slice(0, 6).join(","));
r = await rest(ownerToken, "/rest/v1/staff_audit_log?action=eq.user_removed", { method: "PATCH", body: JSON.stringify({ action: "tampered" }) });
check("owner cannot rewrite the audit log", r.status >= 400, `${r.status}`);
r = await rest(staffToken, "/rest/v1/staff_audit_log?select=id");
check("ordinary staff cannot read the audit log", r.status === 200 && (r.body ?? []).length === 0, `n=${r.body?.length}`);
r = await rest(ownerBToken, "/rest/v1/staff_audit_log?select=id,pharmacy_id");
check("another pharmacy cannot read this audit log",
  r.status === 200 && !(r.body ?? []).some((a) => a.pharmacy_id === IDS.pharmacyA), `n=${r.body?.length}`);

// ── 7. Logout ───────────────────────────────────────────────────────────────
const temp = await login("staffA@e2e.local");
r = await fetch(`${BASE}/auth/v1/logout?scope=global`, {
  method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${temp.body.access_token}` }
});
check("logout is accepted by GoTrue", r.status === 204 || r.status === 200, `${r.status}`);
r = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ refresh_token: temp.body.refresh_token })
});
check("the refresh token no longer works after logout", r.status >= 400, `${r.status}`);

console.log(`\n# ${pass + fail} staff/auth API checks, ${fail} failed`);
process.exit(fail ? 1 : 0);
