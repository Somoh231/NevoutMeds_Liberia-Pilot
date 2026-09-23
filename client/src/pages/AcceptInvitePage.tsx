import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import { acceptInvitation } from "@/platform/data/staffAdmin";
import { DARK, FONT, GREEN } from "@/platform/constants";
import BrandLogo from "@/components/BrandLogo";
import LoadingScreen from "@/platform/reliability/LoadingScreen";

/**
 * Staff acceptance. The token in the URL is only a lookup key: the pharmacy and
 * the role come from the invitation row server-side, so nothing here can choose
 * a tenant or grant itself a role.
 */
export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { configured, loading, user, session, signInWithPassword, signUpForInvitation } = useAuth();
  const token = useMemo(() => (params.get("token") ?? "").trim(), [params]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [mode, setMode] = useState<"signin" | "create">("signin");

  // Signed in already and the invite is valid: accept immediately.
  useEffect(() => {
    if (!token || !session || accepted || busy) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        await acceptInvitation(token);
        if (cancelled) return;
        setAccepted(true);
        // Reload so the profile (pharmacy + role) is picked up everywhere.
        window.location.assign("/platform");
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "This invitation could not be accepted");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, session, accepted, busy]);

  if (loading) return <LoadingScreen label="Checking your invitation…" />;

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 440,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 28,
    backdropFilter: "blur(10px)",
    color: "#e2e8f0"
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${DARK} 0%, #0c1a2e 50%, #064e3b 100%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: FONT }}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <BrandLogo height={30} />
          <div style={{ fontWeight: 950, fontSize: 18, letterSpacing: "-0.02em" }}>Join your pharmacy</div>
        </div>

        {!token && (
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            This link is missing its invitation code. Ask your pharmacy owner to send the invitation again.
            <div style={{ marginTop: 16 }}>
              <Link to="/login" style={{ color: GREEN, fontWeight: 800 }}>Go to sign in</Link>
            </div>
          </div>
        )}

        {token && !configured && (
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>This deployment is not connected to Supabase yet, so invitations cannot be accepted.</div>
        )}

        {token && configured && !session && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                { id: "signin" as const, label: "I have an account" },
                { id: "create" as const, label: "Create my account" }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setMode(t.id); setError(null); }}
                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1.5px solid ${mode === t.id ? GREEN : "rgba(255,255,255,0.18)"}`, background: mode === t.id ? "rgba(16,185,129,0.15)" : "transparent", color: mode === t.id ? "#6ee7b7" : "rgba(226,232,240,0.8)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
              {mode === "signin"
                ? "Sign in with the email address your invitation was sent to."
                : "Use the email address your invitation was sent to, and choose a password. Your pharmacy and role come from the invitation itself."}
            </div>
            <form style={{ display: "grid", gap: 10 }} onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
                  setBusy(true);
                  setError(null);
                  try {
                    if (mode === "create") {
                      if (password.length < 8) throw new Error("Use at least 8 characters for your password");
                      await signUpForInvitation({ email: email.trim(), password });
                    } else {
                      await signInWithPassword({ email: email.trim(), password });
                    }
                  } catch (e: any) {
                    setError(e?.message || (mode === "create" ? "Could not create your account" : "Could not sign in"));
                  } finally {
                    setBusy(false);
                  }
            }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                required
                aria-label="Email"
                autoComplete="username"
                style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: FONT }}
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "create" ? "Choose a password (8+ characters)" : "Your password"}
                type="password"
                required
                aria-label="Password"
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: FONT }}
              />
              <button
                disabled={busy}
                type="submit"
                style={{ padding: "12px", borderRadius: 12, border: "none", background: GREEN, color: "#fff", fontWeight: 900, cursor: busy ? "not-allowed" : "pointer", fontFamily: FONT }}
              >
                {busy ? "Working…" : mode === "create" ? "Create account and join" : "Sign in and join"}
              </button>
              <Link to="/forgot-password" style={{ color: "rgba(226,232,240,0.9)", fontSize: 14, textAlign: "center", padding: "12px 0" }}>
                Forgot your password?
              </Link>
            </form>
          </>
        )}

        {token && configured && session && !error && (
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            {accepted ? "You're in — opening your pharmacy workspace…" : "Joining your pharmacy…"}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 14, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(248,113,113,0.5)", color: "#fecaca", padding: "12px 14px", borderRadius: 12, fontSize: 12.5, fontWeight: 700, lineHeight: 1.6 }}>
            {error}
            <div style={{ marginTop: 10, fontWeight: 600, color: "rgba(254,202,202,0.85)" }}>
              Ask your pharmacy owner to send a new invitation if this one has expired, been used, or was cancelled.
            </div>
            {user && (
              <button
                onClick={() => navigate("/platform")}
                style={{ marginTop: 12, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fecaca", fontWeight: 800, cursor: "pointer", fontFamily: FONT }}
              >
                Continue to the app
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
