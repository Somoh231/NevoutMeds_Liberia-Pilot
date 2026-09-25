/**
 * Two-step verification (TOTP) on Supabase Auth — Phase 11.
 *
 * Supabase Auth generates and stores the authenticator secret and verifies every
 * code; this module only calls its MFA API and reports milestones. Nothing here
 * stores a secret, a code or a "verified" flag: whether a session passed the
 * second step is the `aal` claim Supabase signs into the session's JWT.
 *
 * Who must use it is decided by the server (private.mfa_policy → my_security_posture).
 * Offline, the same decision is made from the last known role and the session's
 * own assurance level; the server enforces it again on every request.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
export type { SecurityPosture } from "@/platform/auth/posture";

export type TotpFactor = { id: string; friendlyName: string | null; createdAt: string; status: "verified" | "unverified" };

export type Enrollment = {
  factorId: string;
  /** SVG data URI from Supabase Auth: the QR code to scan. Shown only during setup. */
  qrCode: string;
  /** The same secret as text, for manual entry. Shown only during setup. */
  secret: string;
};

/** A friendly, non-identifying label for the authenticator (never the email). */
const factorLabel = () => `Authenticator app · ${new Date().toISOString().slice(0, 10)}`;

async function record(supabase: SupabaseClient, event: string, factorId?: string) {
  // Best effort: the audit trail must never block signing in.
  try {
    await supabase.rpc("record_security_event", { p_event: event, p_factor_id: factorId ?? null });
  } catch {
    /* offline or older server: Supabase Auth keeps its own audit log */
  }
}

export async function listTotpFactors(supabase: SupabaseClient): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.all ?? [])
    .filter((f) => f.factor_type === "totp")
    .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, createdAt: f.created_at, status: f.status as TotpFactor["status"] }));
}

/**
 * Starts setting up an authenticator. Leftover unfinished setups are removed
 * first (an abandoned QR code must not linger as a pending factor).
 */
export async function startEnrollment(supabase: SupabaseClient): Promise<Enrollment> {
  for (const f of await listTotpFactors(supabase)) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: factorLabel() });
  if (error) throw error;
  void record(supabase, "mfa_enrollment_started", data.id);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "invalid_code" | "expired" | "offline" | "rate_limited" | "other"; message: string };

function reasonOf(err: { message?: string; code?: string; status?: number } | null | undefined): VerifyResult {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  if (code === "mfa_verification_failed" || /invalid totp|invalid code/i.test(msg)) return { ok: false, reason: "invalid_code", message: "That code didn’t match. Check the time on your phone and try the newest code." };
  if (code === "mfa_challenge_expired" || /expired/i.test(msg)) return { ok: false, reason: "expired", message: "That attempt timed out. Enter the code that your app shows now." };
  if (code === "over_request_rate_limit" || err?.status === 429) return { ok: false, reason: "rate_limited", message: "Too many attempts. Wait a minute, then try again." };
  if (/fetch|network|offline/i.test(msg) || (typeof navigator !== "undefined" && navigator.onLine === false)) return { ok: false, reason: "offline", message: "You’re offline. Connect to the internet to finish this step." };
  return { ok: false, reason: "other", message: "We couldn’t check that code. Try again in a moment." };
}

/**
 * Verifies a 6-digit code for a factor. On success the session is upgraded to
 * aal2 by Supabase Auth; Realtime is handed the new token (supabase-js does not
 * do that on MFA_CHALLENGE_VERIFIED).
 */
export async function verifyCode(supabase: SupabaseClient, factorId: string, code: string, opts: { firstTime?: boolean } = {}): Promise<VerifyResult> {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return { ok: false, reason: "invalid_code", message: "Enter the 6 digits your app shows." };
  try {
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
    if (error) {
      const r = reasonOf(error);
      if (r.ok === false && r.reason === "invalid_code") void record(supabase, "mfa_challenge_failed", factorId);
      return r;
    }
    const token = (data as { access_token?: string } | null)?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
    if (token) supabase.realtime.setAuth(token);
    if (opts.firstTime) void record(supabase, "mfa_factor_verified", factorId);
    return { ok: true };
  } catch (e) {
    return reasonOf(e as { message?: string });
  }
}

/**
 * The verified factor to challenge at sign-in (the newest one). Read from the
 * stored session first (no network: sign-in over 3G is slow enough), then from
 * Supabase Auth.
 */
export async function primaryFactor(supabase: SupabaseClient): Promise<TotpFactor | null> {
  const { data } = await supabase.auth.getSession();
  const local = (data.session?.user?.factors ?? [])
    .filter((f) => f.factor_type === "totp" && f.status === "verified")
    .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, createdAt: f.created_at, status: "verified" as const }));
  const verified = local.length ? local : (await listTotpFactors(supabase)).filter((f) => f.status === "verified");
  verified.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return verified[0] ?? null;
}

/** Removes a factor. Supabase Auth itself requires an aal2 session to remove a verified factor. */
export async function removeFactor(supabase: SupabaseClient, factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  void record(supabase, "mfa_factor_removed", factorId);
  // The session keeps aal2 until it refreshes; refresh now so the posture is honest.
  await supabase.auth.refreshSession().catch(() => undefined);
}

/** Groups a manual-entry key for reading aloud / typing: ABCD EFGH … */
export const groupKey = (secret: string) => secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

export const sessionAal = (session: Session | null): "aal1" | "aal2" => {
  try {
    const payload = JSON.parse(atob(String(session?.access_token ?? "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
};
