import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import { DARK, FONT, GREEN } from "@/platform/constants";
import BrandLogo from "@/components/BrandLogo";

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: `linear-gradient(135deg, ${DARK} 0%, #0c1a2e 50%, #064e3b 100%)`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  fontFamily: FONT
};

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

const field: React.CSSProperties = {
  padding: "12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontFamily: FONT,
  width: "100%"
};

export function ForgotPasswordPage() {
  const { requestPasswordReset, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <BrandLogo height={30} />
          <div style={{ fontWeight: 950, fontSize: 18 }}>Reset your password</div>
        </div>
        {!configured && <div style={{ fontSize: 13 }}>This deployment is not connected to Supabase yet.</div>}
        {configured && !sent && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>Enter your email and we'll send a reset link.</div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" style={field} />
            <button
              disabled={busy || !email.trim()}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await requestPasswordReset(email.trim());
                  setSent(true);
                } catch (e: any) {
                  setError(e?.message || "Could not send the reset email");
                } finally {
                  setBusy(false);
                }
              }}
              style={{ padding: "12px", borderRadius: 12, border: "none", background: GREEN, color: "#fff", fontWeight: 900, cursor: "pointer", fontFamily: FONT }}
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </div>
        )}
        {sent && (
          // Deliberately does not reveal whether the address has an account.
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            If that email belongs to a NevOut Meds account, a reset link is on its way. The link expires shortly — request another if it does.
          </div>
        )}
        {error && <div style={{ marginTop: 12, color: "#fecaca", fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
        <div style={{ marginTop: 16 }}>
          <Link to="/login" style={{ color: GREEN, fontWeight: 800, fontSize: 13 }}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const { updatePassword, session, configured } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <BrandLogo height={30} />
          <div style={{ fontWeight: 950, fontSize: 18 }}>Choose a new password</div>
        </div>

        {!configured && <div style={{ fontSize: 13 }}>This deployment is not connected to Supabase yet.</div>}

        {configured && !session && !done && (
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            This reset link is invalid or has expired. Request a new one.
            <div style={{ marginTop: 14 }}>
              <Link to="/forgot-password" style={{ color: GREEN, fontWeight: 800 }}>Send a new reset link</Link>
            </div>
          </div>
        )}

        {configured && session && !done && (
          <div style={{ display: "grid", gap: 10 }}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="New password" autoComplete="new-password" style={field} />
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="Repeat new password" autoComplete="new-password" style={field} />
            <button
              disabled={busy}
              onClick={async () => {
                if (password.length < 8) return setError("Use at least 8 characters");
                if (password !== confirm) return setError("Those passwords do not match");
                setBusy(true);
                setError(null);
                try {
                  await updatePassword(password);
                  setDone(true);
                } catch (e: any) {
                  setError(e?.message || "Could not update your password");
                } finally {
                  setBusy(false);
                }
              }}
              style={{ padding: "12px", borderRadius: 12, border: "none", background: GREEN, color: "#fff", fontWeight: 900, cursor: "pointer", fontFamily: FONT }}
            >
              {busy ? "Saving…" : "Save new password"}
            </button>
          </div>
        )}

        {done && (
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            Your password is updated.
            <div style={{ marginTop: 14 }}>
              <Link to="/platform" style={{ color: GREEN, fontWeight: 800 }}>Open your workspace</Link>
            </div>
          </div>
        )}

        {error && <div style={{ marginTop: 12, color: "#fecaca", fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
      </div>
    </div>
  );
}
