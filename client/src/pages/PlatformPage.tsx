import { Link, useLocation } from "react-router-dom";
import NevoutmedsApp from "./NevoutmedsApp";
import { useAuth } from "@/platform/auth/AuthProvider";
import RequireRole from "@/platform/auth/RequireRole";
import BrandLogo from "@/components/BrandLogo";
import { useMemo, useState } from "react";
import { Modal, Toast } from "@/platform/components/primitives";
import { submitFeedback } from "@/platform/reliability/telemetry";
import { FONT, GREEN } from "@/platform/constants";

export default function PlatformPage() {
  const { user, signOut } = useAuth();
  const loc = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const [tab, setTab] = useState<"issue" | "feature" | "rating">("issue");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" | "warning" } | null>(null);

  const supportWhatsappHref = useMemo(() => {
    const text = encodeURIComponent(`Hi NevOut Meds support — I need help with the pilot.\nPage: ${loc.pathname}\nPharmacy: ${user?.pharmacy ?? ""}`);
    return `https://wa.me/?text=${text}`;
  }, [loc.pathname, user?.pharmacy]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <Toast toast={toast} />
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid rgba(15,23,42,0.08)"
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 950, letterSpacing: "-0.03em" }}>
            <BrandLogo height={28} />
            <span>NevOut Meds Platform</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setHelpOpen(true)}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.12)",
                background: "rgba(255,255,255,0.75)",
                fontWeight: 850,
                fontSize: 13,
                cursor: "pointer"
              }}
              title="Help & feedback"
            >
              Help
            </button>
            <RequireRole allow={["admin"]}>
              <Link
                to="/admin"
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(255,255,255,0.75)",
                  fontWeight: 850,
                  fontSize: 13,
                  textDecoration: "none",
                  color: "#0f172a"
                }}
              >
                Admin
              </Link>
            </RequireRole>
            <RequireRole allow={["owner", "admin"]}>
              <Link
                to="/import"
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(255,255,255,0.75)",
                  fontWeight: 850,
                  fontSize: 13,
                  textDecoration: "none",
                  color: "#0f172a"
                }}
              >
                Import
              </Link>
            </RequireRole>
            <Link
              to="/"
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.12)",
                background: "rgba(255,255,255,0.75)",
                fontWeight: 850,
                fontSize: 13
              }}
            >
              ← Public Homepage
            </Link>
            <button
              onClick={() => void signOut()}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.12)",
                background: "rgba(255,255,255,0.75)",
                fontWeight: 850,
                fontSize: 13,
                cursor: "pointer"
              }}
              title="Sign out"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <NevoutmedsApp user={user} onLogout={signOut} />

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} maxW={640}>
        <div style={{ fontFamily: FONT }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.02em" }}>Help & Feedback</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 1.6 }}>
                Your feedback goes straight into the pilot tracker (stored in Supabase).
              </div>
            </div>
            <button onClick={() => setHelpOpen(false)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, cursor: "pointer" }}>
              Close
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {[
              { id: "issue" as const, label: "Report issue" },
              { id: "feature" as const, label: "Request feature" },
              { id: "rating" as const, label: "Quick rating" }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: `1.5px solid ${tab === t.id ? "#10b981" : "#e2e8f0"}`,
                  background: tab === t.id ? "#f0fdf4" : "#fff",
                  color: tab === t.id ? "#047857" : "#64748b",
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: "pointer"
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab !== "rating" && (
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" style={{ padding: "12px 12px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>Details</span>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What happened? What did you expect?" style={{ padding: "12px 12px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", minHeight: 110, resize: "vertical" }} />
              </label>
            </div>
          )}

          {tab === "rating" && (
            <div style={{ marginTop: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 950, color: "#0f172a" }}>How satisfied are you today?</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: `1.5px solid ${rating === n ? "#10b981" : "#e2e8f0"}`,
                      background: rating === n ? "#f0fdf4" : "#fff",
                      fontWeight: 950,
                      cursor: "pointer"
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 10, lineHeight: 1.6 }}>1 = not usable · 5 = excellent</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              disabled={busy}
              onClick={async () => {
                if (!user?.pharmacyId) return setToast({ msg: "Missing pharmacy_id (finish onboarding first).", type: "warning" });
                setBusy(true);
                try {
                  if (tab === "rating") {
                    await submitFeedback({ pharmacyId: user.pharmacyId, userId: String(user.id), kind: "rating", rating, page: loc.pathname });
                  } else {
                    if (!title.trim()) throw new Error("Title is required.");
                    if (!message.trim()) throw new Error("Details are required.");
                    await submitFeedback({ pharmacyId: user.pharmacyId, userId: String(user.id), kind: tab, title: title.trim(), message: message.trim(), page: loc.pathname });
                  }
                  setToast({ msg: "Thanks — feedback received.", type: "success" });
                  setTitle("");
                  setMessage("");
                  setHelpOpen(false);
                } catch (e: any) {
                  setToast({ msg: e?.message || "Failed to submit feedback", type: "error" });
                } finally {
                  setBusy(false);
                }
              }}
              style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: GREEN, color: "#fff", fontWeight: 950, cursor: busy ? "not-allowed" : "pointer" }}
            >
              {busy ? "Sending…" : "Send"}
            </button>

            <a href="mailto:support@nevoutmeds.com" style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, color: "#0f172a", textDecoration: "none" }}>
              Contact support
            </a>
            <a href={supportWhatsappHref} target="_blank" rel="noreferrer" style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, color: "#0f172a", textDecoration: "none" }}>
              WhatsApp help
            </a>
            <button onClick={() => setToast({ msg: "FAQ is coming soon (pilot placeholder).", type: "info" })} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 900, cursor: "pointer" }}>
              FAQ
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

