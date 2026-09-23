import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { User as PlatformUser } from "@/platform/domain";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { toPlatformUser } from "@/platform/auth/roles";
import { fetchPharmacyName, fetchUserProfile } from "@/platform/data/userProfile";
import { readProfileSnapshot, saveProfileSnapshot, snapshotAllowsOfflineUse } from "@/platform/offline/session";

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
  requestPasswordReset: (email: string) => Promise<void>;
  /** Creates an account for someone holding an invitation link. */
  signUpForInvitation: (args: { email: string; password: string }) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signInWithPassword: (args: { email: string; password: string }) => Promise<void>;
  signUpOwner: (args: { email: string; password: string; name: string; pharmacy: string }) => Promise<void>;
  signOut: () => Promise<void>;
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
  setUser: (u: PlatformUser | null) => void
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
      const pharmacyName = (await fetchPharmacyName(String(profile.pharmacy_id)).catch(() => null)) ?? base.pharmacy;
      void saveProfileSnapshot({
        user_id: userId,
        pharmacy_id: String(profile.pharmacy_id),
        role: (profile.role ?? "staff") as "owner" | "staff" | "admin",
        name: profile.name ?? base.name,
        pharmacy_name: pharmacyName,
        status: (profile as { status?: string }).status ?? "active"
      });
      return { ...base, name: profile.name ?? base.name, role: profile.role ?? base.role, pharmacyId: profile.pharmacy_id, pharmacy: pharmacyName };
    }
    return base;
  } catch {
    // Offline (or the API is unreachable): fall back to what this device
    // already knew about itself.
    const snapshot = await readProfileSnapshot(userId);
    if (snapshotAllowsOfflineUse(snapshot)) {
      return { ...base, name: snapshot!.name, role: snapshot!.role, pharmacyId: snapshot!.pharmacy_id, pharmacy: snapshot!.pharmacy_name ?? base.pharmacy };
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
      if (getErr) setError(getErr.message);
      setSession(data.session ?? null);
      if (data.session?.user) {
        const base = toPlatformUser(data.session.user);
        setUser(await resolvePlatformUser(base, data.session.user.id));
        await refreshAccountStatus(supabase, setAccountStatus, setUser);
        // Best-effort activity stamp for pilot analytics (RLS allows self-update).
        void supabase.from("users_profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", data.session.user.id);
      } else {
        setUser(null);
      }
      setLoading(false);

      const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
        setSession(nextSession);
        if (!nextSession?.user) {
          setUser(null);
          return;
        }
        const base = toPlatformUser(nextSession.user);
        void resolvePlatformUser(base, nextSession.user.id).then(setUser);

        void refreshAccountStatus(supabase, setAccountStatus, setUser);

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
  }, [supabase]);

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
      },
      async signUpOwner({ email, password, name, pharmacy }) {
        setError(null);
        if (!supabase) {
          if (!DEMO_MODE) throw new Error("Supabase is not configured");
          setUser(DEMO_USER);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role: "owner", name, pharmacy }
          }
        });
        if (error) throw error;
      },
      accountStatus,
      async signUpForInvitation({ email, password }) {
        setError(null);
        if (!supabase) throw new Error("Supabase is not configured");
        // An account by itself carries no pharmacy and no role: the invitation
        // token, validated server-side, is what grants access.
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
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
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    }),
    [accountStatus, error, loading, session, supabase, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

