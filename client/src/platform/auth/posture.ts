/**
 * Two-step verification posture (Phase 11): the only MFA code in the main
 * bundle. It answers one question for the route guard: is this session strong
 * enough for this account? Setup, verification and removal live in mfa.ts,
 * loaded only with the screens that use them.
 *
 * Who must use MFA is decided by the server (private.mfa_policy →
 * my_security_posture). Offline, the same decision is made from the last known
 * role and the session's own assurance level; the server enforces it again on
 * every request. Nothing here stores a "verified" flag: the aal claim in the
 * session's JWT, signed by Supabase Auth, is the only source.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mfaRequiredFor } from "@/platform/auth/capabilities";

export type SecurityPosture = {
  /** "ready" once decided; "unknown" while the first check runs. */
  status: "unknown" | "ready";
  required: boolean;
  enrolled: boolean;
  aal: "aal1" | "aal2";
  /** The session is strong enough for this account: the workspace may open. */
  satisfied: boolean;
  /** Decided from local state because the server was unreachable. */
  offline: boolean;
};

export const UNKNOWN_POSTURE: SecurityPosture = { status: "unknown", required: false, enrolled: false, aal: "aal1", satisfied: false, offline: false };

/** Posture from the server (authoritative) or, when unreachable, from this device. */
export async function loadPosture(supabase: SupabaseClient, role: string | undefined): Promise<SecurityPosture> {
  const local = await localPosture(supabase, role);
  try {
    const { data, error } = await supabase.rpc("my_security_posture");
    if (error || !data) return local;
    const p = data as { mfa_required: boolean; mfa_enrolled: boolean; aal: string; mfa_satisfied: boolean };
    return {
      status: "ready",
      required: !!p.mfa_required,
      enrolled: !!p.mfa_enrolled,
      aal: p.aal === "aal2" ? "aal2" : "aal1",
      satisfied: !!p.mfa_satisfied,
      offline: false
    };
  } catch {
    return local;
  }
}

/** Uses only the stored session (no network): aal and factor state come from Supabase's own session. */
export async function localPosture(supabase: SupabaseClient, role: string | undefined): Promise<SecurityPosture> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = data?.currentLevel === "aal2" ? "aal2" : "aal1";
  const enrolled = data?.nextLevel === "aal2";
  const required = mfaRequiredFor(role);
  return { status: "ready", required, enrolled, aal, satisfied: aal === "aal2" || (!required && !enrolled), offline: true };
}
