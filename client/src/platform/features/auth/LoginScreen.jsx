import { useState } from "react";
import { DARK, FONT } from "@/platform/constants";
import { USERS } from "@/platform/seed/users";

export default function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("owner");
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
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 60,
              height: 60,
              borderRadius: 16,
              background: "linear-gradient(135deg,#10b981,#059669)",
              boxShadow: "0 8px 24px #10b98140",
              marginBottom: 16
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>N</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>Nevoutmeds</div>
          <div style={{ fontSize: 13, color: "#6ee7b7", marginTop: 4, fontWeight: 500 }}>Never out of stock. Always ready.</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, padding: 28, backdropFilter: "blur(10px)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>Monrovia Central Pharmacy</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {["owner", "staff"].map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                style={{
                  padding: "12px",
                  borderRadius: 10,
                  border: `1.5px solid ${role === r ? "#10b981" : "rgba(255,255,255,0.15)"}`,
                  background: role === r ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)",
                  color: role === r ? "#6ee7b7" : "#94a3b8",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: FONT,
                  transition: "all 0.2s"
                }}
              >
                {r === "owner" ? "👤 Owner" : "🏥 Staff"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginBottom: 18 }}>
            {role === "owner" ? "Full access including financials & staff data" : "Operational access — inventory, customers, suppliers"}
          </div>
          <button
            onClick={() => onLogin(USERS[role])}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#10b981,#059669)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: FONT,
              boxShadow: "0 4px 16px #10b98140"
            }}
          >
            Sign In →
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#334155" }}>Liberia Pilot v2.0 · Secured & Encrypted</div>
      </div>
    </div>
  );
}

