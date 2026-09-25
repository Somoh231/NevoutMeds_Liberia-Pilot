import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { User as PlatformUser } from "@/platform/domain";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { toPlatformUser } from "@/platform/auth/roles";
import { fetchPharmacy, fetchUserProfile } from "@/platform/data/userProfile";
import { resolveTenantConfig } from "@/platform/country/tenant";
import { readProfileSnapshot, saveProfileSnapshot, snapshotAllowsOfflineUse } from "@/platform/offline/session";
import { UNKNOWN_POSTURE, loadPosture, type SecurityPosture } from "@/platform/auth/posture";
import { captureException, setMonitoringContext } from "@/platform/observability/monitoring";

// Demo Mode is opt-in only (VITE_DEMO_MODE=true at build time). Without it, a
// build with no Supabase config must fail CLOSED: an unconfigured deployment
// used to sign every visitor in as an admin.
export const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() === "true";

const DEMO_USER: PlatformUser = {
  id: "demo",
  name: "Demo Admin",
  role: "admin",
  pharmacy: "Demo Pharmacy",
  pharmacyId: undefined
};

type AuthState = {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  user: PlatformUser | null;
  error: string | null;
  /** 'active' | 'suspended' | 'removed' | null (no profile yet). */
  accountStatus: string | null;
  /**
   * Why the last session ended, when it was not the user's own choice:
   * 'expired' (the session could not be refreshed) or 'suspended'/'removed'.
   * The sign-in page explains it instead of silently showing a blank form.
   */
  endReason: "expired" | "suspended" | "removed" | null;
  clearEndReason: () => void;
  requestPasswordReset: (email: string) => Promise<void>;
  /**
   * Creates an account for someone holding an invitation link. When the
   * project requires email confirmation, needsConfirmation is true and the
   * confirmation link brings the person back to `returnTo` (the invitation).
   */
  signUpForInvitation: (args: { email: string; password: string; returnTo?: string }) => Promise<{ needsConfirmation: boolean }>;
  updatePassword: (newPassword: string) => Promise<void>;
  signInWithPassword: (args: { email: string; password: string }) => Promise<void>;
  /** Resolves with needsConfirmation=true when the project requires email confirmation first. */
  signUpOwner: (args: { email: string; password: string; name: string; pharmacy: string }) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Re-reads the user's profile and pharmacy (e.g. after Settings change the country configuration). */
  refreshProfile: () => Promise<void>;
  /**
   * Two-step verification state of this session (Phase 11). The workspace opens
   * only when `satisfied`; the database enforces the same rule on every request.
   */
  security: SecurityPosture;
  refreshSecurity: () => Promise<void>;
  /**
   * True while a just-finished authenticator setup is showing its confirmation
   * (and the lost-phone advice). Keeps the setup screen up after the session
   * becomes aal2, until the person presses Continue. Never grants access.
   */
  mfaSetupShowing: boolean;
  setMfaSetupShowing: (v: boolean) => void;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * A suspended or offboarded account keeps a valid JWT until it expires, but the
 * database refuses every tenant query. The app must not look "logged in" in
 * that state, so the session is ended as soon as the status is known.
 */
async function refreshAccountStatus(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  setAccountStatus: (s: string | null) => void,
  setUser: (u: PlatformUser | null) => void,
  onEnded?: (reason: "suspended" | "removed") => void
) {
  try {
    const { data, error } = await supabase.rpc("my_account_status");
    // A network error is not an authorisation answer: stay signed in and let
    // the server reject any queued work when connectivity returns.
    if (error) return;
    const status = (data as string | null) ?? null;
    setAccountStatus(status);
    if (status === "suspended" || status === "removed") {
      setUser(null);
      onEnded?.(status);
      await supabase.auth.signOut();
    }
  } catch {
    // Network failure: leave the session alone; the database still denies access.
  }
}

/**
 * Resolves the signed-in user's pharmacy and role.
 *
 * Online, the server profile is authoritative and is cached. Offline, the last
 * cached profile is used so the device keeps working; the server still
 * authorises every write when the queue syncs.
 */
async function resolvePlatformUser(base: PlatformUser, userId: string): Promise<PlatformUser> {
  try {
    const profile = await fetchUserProfile(userId);
    if (profile) {
      // The display name comes from the tenant's pharmacies row, never from
      // user_metadata (absent for invited staff, and user-writable).
      const pharmacy = await fetchPharmacy(String(profile.pharmacy_id)).catch(() => null);
      // If the pharmacy row couldn't be read (offline, or before two-step
      // verification), keep the last known name and country configuration
      // rather than overwriting them with placeholders and defaults.
      const cached = pharmacy ? null : await readProfileSnapshot(userId);
      const pharmacyName = pharmacy?.name ?? cached?.pharmacy_name ?? base.pharmacy;
      const country = pharmacy?.config ?? cached?.country ?? resolveTenantConfig(null);
      void saveProfileSnapshot({
        user_id: userId,
        pharmacy_id: String(profile.pharmacy_id),
        role: (profile.role ?? "staff") as "owner" | "staff" | "admin",
        name: profile.name ?? base.name,
        pharmacy_name: pharmacyName,
        country,
        status: (profile as { status?: string }).status ?? "active"
      });
      return { ...base, name: profile.name ?? base.name, role: profile.role ?? base.role, pharmacyId: profile.pharmacy_id, pharmacy: pharmacyName, country };
    }
    return base;
  } catch {
    // Offline (or the API is unreachable): fall back to what this device
    // already knew about itself.
    const snapshot = await readProfileSnapshot(userId);
    if (snapshotAllowsOfflineUse(snapshot)) {
      return {
        ...base, name: snapshot!.name, role: snapshot!.role, pharmacyId: snapshot!.pharmacy_id,
        pharmacy: snapshot!.pharmacy_name ?? base.pharmacy, country: snapshot!.country ?? resolveTenantConfig(null)
      };
    }
    return base;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<AuthState["endReason"]>(null);
  // Set while the user signs out on purpose, so that SIGNED_OUT is not read as an expiry.
  const signingOut = useRef(false);
  // Profile resolutions can overlap (initial session, SIGNED_IN, token refresh).
  // Only the most recently started one may set the user, so a slower, stale
  // resolution can never replace a newer one (e.g. sending an owner to
  // onboarding because an earlier lookup ran before their profile was visible).
  const resolveSeq = useRef(0);
  const applyResolved = useCallback(async (base: PlatformUser, userId: string) => {
    const seq = ++resolveSeq.current;
    const resolved = await resolvePlatformUser(base, userId);
    if (seq === resolveSeq.current) setUser(resolved);
  }, []);
  const hadSession = useRef(false);
  const clearEndReason = useCallback(() => setEndReason(null), []);

  // Security posture follows the session token (aal changes after verification)
  // and the resolved role. Only the latest check may win.
  const [security, setSecurity] = useState<SecurityPosture>(UNKNOWN_POSTURE);
  const [mfaSetupShowing, setMfaSetupShowing] = useState(false);
  const postureSeq = useRef(0);
  const accessToken = session?.access_token ?? null;
  const resolvedRole = user?.role;
  const lastPosture = useRef<SecurityPosture>(UNKNOWN_POSTURE);
  const sessionUser = session?.user ?? null;
  const refreshSecurity = useCallback(async () => {
    const seq = ++postureSeq.current;
    if (!supabase || !accessToken) {
      lastPosture.current = UNKNOWN_POSTURE;
      setSecurity(UNKNOWN_POSTURE);
      return;
    }
    const next = await loadPosture(supabase, resolvedRole);
    if (seq !== postureSeq.current) return;
    // The session just passed two-step verification: the pharmacy row (name,
    // country, timezone, currency) was unreadable a moment ago, so read the
    // profile again BEFORE the workspace opens. Otherwise screens would start
    // with default country settings (e.g. the wrong business day).
    const prev = lastPosture.current;
    if (next.satisfied && prev.status === "ready" && !prev.satisfied && sessionUser) {
      await applyResolved(toPlatformUser(sessionUser), sessionUser.id);
      if (seq !== postureSeq.current) return;
    }
    lastPosture.current = next;
    setSecurity(next);
  }, [supabase, accessToken, resolvedRole, sessionUser, applyResolved]);
  useEffect(() => {
    void refreshSecurity();
  }, [refreshSecurity]);

  // Monitoring gets the role category and the pharmacy id, which the SDK turns
  // into a one-way pseudonym. Never a name or an email.
  useEffect(() => {
    setMonitoringContext({ role: user?.role ?? null, pharmacyId: user?.pharmacyId ? String(user.pharmacyId) : null });
  }, [user?.role, user?.pharmacyId]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!supabase) {
        if (!mounted) return;
        setLoading(false);
        setSession(null);
        // Only an explicit demo build gets the demo user; otherwise nobody is
        // signed in and the route guards send the visitor to /login.
        setUser(DEMO_MODE ? DEMO_USER : null);
        setError(DEMO_MODE ? null : "Supabase is not configured");
        return;
      }

      const { data, error: getErr } = await supabase.auth.getSession();
      if (!mounted) return;
      if (getErr) {
        setError(getErr.message);
        // Reading the stored session should never fail; when it does it is a fault.
        captureException(getErr, { area: "auth" });
      }
      setSession(data.session ?? null);
      if (data.session?.user) {
        const base = toPlatformUser(data.session.user);
        await applyResolved(base, data.session.user.id);
        await refreshAccountStatus(supabase, setAccountStatus, setUser, (r) => { signingOut.current = true; setEndReason(r); });
        // Best-effort activity stamp for pilot analytics (RLS allows self-update).
        void supabase.from("users_profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", data.session.user.id);
      } else {
        setUser(null);
      }
      setLoading(false);

      hadSession.current = !!data.session;
      const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
        setSession(nextSession);
        if (!nextSession?.user) {
          if (event === "SIGNED_OUT" && hadSession.current && !signingOut.current) setEndReason((r) => r ?? "expired");
          signingOut.current = false;
          hadSession.current = false;
          resolveSeq.current++; // discard any resolution still in flight
          setUser(null);
          return;
        }
        hadSession.current = true;
        const base = toPlatformUser(nextSession.user);
        void applyResolved(base, nextSession.user.id);

        void refreshAccountStatus(supabase, setAccountStatus, setUser, (r) => { signingOut.current = true; setEndReason(r); });

        const nowIso = new Date().toISOString();
        void supabase
          .from("users_profiles")
          .update(event === "SIGNED_IN" ? { last_login_at: nowIso, last_seen_at: nowIso } : { last_seen_at: nowIso })
          .eq("id", nextSession.user.id);
      });

      return () => sub.subscription.unsubscribe();
    }

    const cleanupPromise = init();
    return () => {
      mounted = false;
      void cleanupPromise;
    };
  }, [supabase, applyResolved]);

  const value: AuthState = useMemo(
    () => ({
      loading,
      configured: !!supabase,
      session,
      user,
      error,
      async signInWithPassword({ email, password }) {
        setError(null);
        if (!supabase) {
          if (!DEMO_MODE) throw new Error("Supabase is not configured");
          setUser(DEMO_USER);
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setEndReason(null);
      },
      async signUpOwner({ email, password, name, pharmacy }) {
        setError(null);
        if (!supabase) {
          if (!DEMO_MODE) throw new Error("Supabase is not configured");
          setUser(DEMO_USER);
          return { needsConfirmation: false };
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role: "owner", name, pharmacy },
            // After confirming their email, a new owner continues to set up the pharmacy.
            emailRedirectTo: `${window.location.origin}/onboarding`
          }
        });
        if (error) throw error;
        return { needsConfirmation: !data.session };
      },
      accountStatus,
      async signUpForInvitation({ email, password, returnTo }) {
        setError(null);
        if (!supabase) throw new Error("Supabase is not configured");
        // An account by itself carries no pharmacy and no role: the invitation
        // token, validated server-side, is what grants access. The return link is
        // always on this app's own origin.
        const safeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/accept-invite";
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${safeReturn}` }
        });
        if (error) throw error;
        return { needsConfirmation: !data.session };
      },
      async requestPasswordReset(email: string) {
        setError(null);
        if (!supabase) throw new Error("Supabase is not configured");
        // Redirect target is this app's own origin — never a value from a URL.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) throw error;
      },
      async updatePassword(newPassword: string) {
        setError(null);
        if (!supabase) throw new Error("Supabase is not configured");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
      },
      async signOut() {
        setError(null);
        if (!supabase) {
          setUser(DEMO_MODE ? DEMO_USER : null);
          return;
        }
        signingOut.current = true;
        setEndReason(null);
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      async refreshProfile() {
        if (!supabase || !session?.user || !user) return;
        await applyResolved(user, session.user.id);
      },
      endReason,
      clearEndReason,
      // Demo builds have no second factor to check.
      security: !supabase && DEMO_MODE ? { ...UNKNOWN_POSTURE, status: "ready", satisfied: true } : security,
      refreshSecurity,
      mfaSetupShowing,
      setMfaSetupShowing
    }),
    [accountStatus, applyResolved, clearEndReason, endReason, error, loading, mfaSetupShowing, refreshSecurity, security, session, supabase, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

