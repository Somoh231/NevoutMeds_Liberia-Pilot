// NevOut Meds — trusted staff administration.
//
// This is the ONLY place a service-role key exists. It is read from the
// function's environment (never a VITE_* variable, never shipped to the
// browser) and is used for exactly two things the database cannot do itself:
//   * sending the invitation email through Supabase Auth
//   * banning / unbanning the auth identity so a suspended or offboarded
//     person cannot refresh a session or sign in again
//
// Every authorization decision is still made in the database: each action first
// calls the matching SECURITY DEFINER RPC **as the caller**, using the caller's
// own JWT. If the RPC refuses (not an owner, wrong pharmacy, target is a
// platform admin, …) nothing privileged happens.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Redirects are constrained to an allow-list so an invitation link can never be
// pointed at an attacker's site.
const ALLOWED_APP_ORIGINS = (Deno.env.get("NEVOUT_ALLOWED_APP_ORIGINS") ??
  "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://127.0.0.1:4178")
  .split(",").map((s) => s.trim()).filter(Boolean);

const DEFAULT_APP_ORIGIN = Deno.env.get("NEVOUT_APP_ORIGIN") ?? ALLOWED_APP_ORIGINS[0];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function safeAcceptUrl(requestedOrigin: string | undefined, token: string) {
  let origin = DEFAULT_APP_ORIGIN;
  if (requestedOrigin) {
    try {
      const candidate = new URL(requestedOrigin).origin;
      if (ALLOWED_APP_ORIGINS.includes(candidate)) origin = candidate;
    } catch {
      // ignore a malformed origin and fall back to the default
    }
  }
  return `${origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "missing bearer token" }, 401);

  // Acts strictly as the caller: RLS and the RPC guards apply.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "invalid session" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const action = String(body.action ?? "");

  // Service-role client: only reached after the database authorised the action.
  const asService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    if (action === "invite") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const name = body.name ? String(body.name) : null;
      const role = String(body.role ?? "staff");

      // The RPC decides whether this caller may invite, and for what role.
      const { data, error } = await asCaller.rpc("invite_staff", {
        p_email: email, p_name: name, p_role: role
      });
      if (error) return json({ error: error.message }, 403);

      const token = (data as { token: string }).token;
      const acceptUrl = safeAcceptUrl(body.app_origin as string | undefined, token);

      // Best effort: email the invitee. The link is also returned so the owner
      // can send it over WhatsApp, which is how most Liberian pilots work.
      let emailed = false;
      let emailError: string | null = null;
      const { error: inviteErr } = await asService.auth.admin.inviteUserByEmail(email, { redirectTo: acceptUrl });
      if (inviteErr) {
        // Already-registered users cannot be "invited" again; that is fine —
        // they simply follow the link and sign in.
        emailError = inviteErr.message;
      } else {
        emailed = true;
      }

      return json({
        ok: true,
        invitation_id: (data as { invitation_id: string }).invitation_id,
        email,
        role,
        expires_at: (data as { expires_at: string }).expires_at,
        accept_url: acceptUrl,
        emailed,
        email_error: emailError
      });
    }

    if (action === "suspend" || action === "reactivate" || action === "remove") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id is required" }, 400);

      const rpc = action === "suspend" ? "suspend_staff" : action === "reactivate" ? "reactivate_staff" : "remove_staff";
      const { error } = await asCaller.rpc(rpc, { p_user_id: targetId });
      if (error) return json({ error: error.message }, 403);

      // Auth-side enforcement: a ban stops token refresh and new sign-ins, so
      // the person cannot keep working on a cached session.
      const banDuration = action === "reactivate" ? "none" : "876000h"; // ~100 years
      const { error: banErr } = await asService.auth.admin.updateUserById(targetId, { ban_duration: banDuration });

      return json({ ok: true, action, user_id: targetId, auth_updated: !banErr, auth_error: banErr?.message ?? null });
    }

    if (action === "set_role") {
      const targetId = String(body.user_id ?? "");
      const role = String(body.role ?? "");
      if (!targetId || !role) return json({ error: "user_id and role are required" }, 400);
      const { error } = await asCaller.rpc("set_staff_role", { p_user_id: targetId, p_role: role });
      if (error) return json({ error: error.message }, 403);
      return json({ ok: true, action, user_id: targetId, role });
    }

    if (action === "resend" || action === "revoke") {
      const invitationId = String(body.invitation_id ?? "");
      if (!invitationId) return json({ error: "invitation_id is required" }, 400);

      if (action === "revoke") {
        const { error } = await asCaller.rpc("revoke_staff_invitation", { p_invitation_id: invitationId });
        if (error) return json({ error: error.message }, 403);
        return json({ ok: true, action, invitation_id: invitationId });
      }

      const { data, error } = await asCaller.rpc("resend_staff_invitation", { p_invitation_id: invitationId });
      if (error) return json({ error: error.message }, 403);
      const token = (data as { token: string }).token;
      const acceptUrl = safeAcceptUrl(body.app_origin as string | undefined, token);
      const email = (data as { email: string }).email;
      const { error: inviteErr } = await asService.auth.admin.inviteUserByEmail(email, { redirectTo: acceptUrl });
      return json({ ok: true, action, invitation_id: invitationId, accept_url: acceptUrl, emailed: !inviteErr });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unexpected error" }, 500);
  }
});
