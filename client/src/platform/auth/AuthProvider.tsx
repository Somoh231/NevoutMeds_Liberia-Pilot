import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { User as PlatformUser } from "@/platform/domain";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { toPlatformUser } from "@/platform/auth/roles";
import { fetchUserProfile } from "@/platform/data/userProfile";

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
  signInWithPassword: (args: { email: string; password: string }) => Promise<void>;
  signUpOwner: (args: { email: string; password: string; name: string; pharmacy: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!supabase) {
        if (!mounted) return;
        setLoading(false);
        setSession(null);
        // Demo Mode: allow access using existing seed/mock data.
        setUser(DEMO_USER);
        setError(null);
        return;
      }

      const { data, error: getErr } = await supabase.auth.getSession();
      if (!mounted) return;
      if (getErr) setError(getErr.message);
      setSession(data.session ?? null);
      if (data.session?.user) {
        const base = toPlatformUser(data.session.user);
        try {
          const profile = await fetchUserProfile(data.session.user.id);
          setUser(
            profile
              ? {
                  ...base,
                  name: profile.name ?? base.name,
                  role: profile.role ?? base.role,
                  pharmacyId: profile.pharmacy_id,
                  pharmacy: base.pharmacy
                }
              : base
          );
        } catch {
          setUser(base);
        }
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
        fetchUserProfile(nextSession.user.id)
          .then((profile) => {
            setUser(
              profile
                ? {
                    ...base,
                    name: profile.name ?? base.name,
                    role: profile.role ?? base.role,
                    pharmacyId: profile.pharmacy_id,
                    pharmacy: base.pharmacy
                  }
                : base
            );
          })
          .catch(() => setUser(base));

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
          // Demo Mode: keep a stable demo user (no real auth).
          setUser(DEMO_USER);
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUpOwner({ email, password, name, pharmacy }) {
        setError(null);
        if (!supabase) {
          // Demo Mode: keep a stable demo user (no real signup).
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
      async signOut() {
        setError(null);
        if (!supabase) {
          // Demo Mode: keep demo access (don't break /platform rendering).
          setUser(DEMO_USER);
          return;
        }
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    }),
    [error, loading, session, supabase, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

