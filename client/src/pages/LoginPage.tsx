import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "@/platform/auth/AuthProvider";
import { DARK, FONT } from "@/platform/constants";
import SupabaseNotConfiguredScreen from "@/platform/auth/SupabaseNotConfiguredScreen";
import BrandLogo from "@/components/BrandLogo";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { configured, error: cfgError, loading, signInWithPassword, signUpOwner, user } = useAuth();

  const redirectTo = useMemo(() => {
    const from = (location.state as any)?.from as string | undefined;
    return from || "/platform";
  }, [location.state]);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [name, setName] = useState("");
  const [pharmacy, setPharmacy] = useState("Monrovia Central Pharmacy");

  if (!loading && user) return <Navigate to={redirectTo} replace />;
  if (!loading && !configured)
    return (
      <SupabaseNotConfiguredScreen
        title="Supabase is not configured"
        subtitle="To enable email/password login, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server."
      />
    );

  const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 440,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 28,
    backdropFilter: "blur(10px)"
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${DARK} 0%, #0c1a2e 50%, #064e3b 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: FONT,
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 20% 50%, #10b98115 0%, transparent 50%), radial-gradient(circle at 80% 20%, #3b82f615 0%, transparent 50%)",
          pointerEvents: "none"
        }}
      />

      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 5 }}>
        <Link
          to="/"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(2,6,23,0.35)",
            color: "rgba(255,255,255,0.92)",
            fontWeight: 850,
            textDecoration: "none",
            backdropFilter: "blur(10px)"
          }}
        >
          ← Back to site
        </Link>
      </div>

      <div style={{ width: "100%", maxWidth: 460, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 16px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.16)",
              boxShadow: "0 8px 24px rgba(2,6,23,0.25)",
              marginBottom: 16
            }}
          >
            <BrandLogo height={52} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>NevOut Meds</div>
          <div style={{ fontSize: 13, color: "#6ee7b7", marginTop: 4, fontWeight: 500 }}>Sign in to your pharmacy workspace</div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
            {[
              { id: "login" as const, label: "Login" },
              { id: "signup" as const, label: "Owner Signup" }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setMode(t.id)}
                style={{
                  padding: "12px",
                  borderRadius: 10,
                  border: `1.5px solid ${mode === t.id ? "#10b981" : "rgba(255,255,255,0.15)"}`,
                  background: mode === t.id ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
                  color: mode === t.id ? "#6ee7b7" : "#94a3b8",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: FONT,
                  transition: "all 0.2s"
                }}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Owner name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Kamara" style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Pharmacy</span>
                <input value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} placeholder="Pharmacy name" style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
              </label>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@pharmacy.com" autoComplete="email" style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Password</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" autoComplete={mode === "signup" ? "new-password" : "current-password"} style={{ width: "100%", padding: "12px 12px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "#fff", outline: "none", fontFamily: FONT }} />
            </label>

            {(err || cfgError) && (
              <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)", padding: "10px 12px", borderRadius: 12, color: "#fecaca", fontSize: 12, lineHeight: 1.5 }}>
                {err || cfgError}
              </div>
            )}

            <button
              disabled={busy || loading}
              onClick={async () => {
                setErr(null);
                setBusy(true);
                try {
                  if (mode === "signup") {
                    if (!name.trim()) throw new Error("Please enter the owner name.");
                    if (!pharmacy.trim()) throw new Error("Please enter the pharmacy name.");
                    await signUpOwner({ email, password, name: name.trim(), pharmacy: pharmacy.trim() });
                  } else {
                    await signInWithPassword({ email, password });
                  }
                  navigate(redirectTo, { replace: true });
                } catch (e: any) {
                  setErr(e?.message || "Authentication failed");
                } finally {
                  setBusy(false);
                }
              }}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg,#10b981,#059669)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 900,
                cursor: busy ? "not-allowed" : "pointer",
                fontFamily: FONT,
                boxShadow: "0 4px 16px #10b98140",
                opacity: busy ? 0.75 : 1
              }}
              type="button"
            >
              {mode === "signup" ? "Create owner account →" : "Sign in →"}
            </button>

            <div style={{ fontSize: 12, color: "rgba(148,163,184,0.92)", lineHeight: 1.6 }}>
              <b style={{ color: "#e2e8f0" }}>Roles:</b> owners can sign up here. Staff/admin accounts should be provisioned by admins (next step: RLS + admin tooling).
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: "#334155" }}>
          Secure session persistence via Supabase Auth · Ready for RLS
        </div>
      </div>
    </div>
  );
}

