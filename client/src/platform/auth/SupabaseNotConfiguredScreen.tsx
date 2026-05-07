import { Link } from "react-router-dom";
import { DARK, FONT, GREEN, SLATE } from "@/platform/constants";
import BrandLogo from "@/components/BrandLogo";

export default function SupabaseNotConfiguredScreen({
  title = "Supabase is not configured",
  subtitle = "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.",
  showBackToSite = true
}: {
  title?: string;
  subtitle?: string;
  showBackToSite?: boolean;
}) {
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

      {showBackToSite && (
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
      )}

      <div style={{ width: "100%", maxWidth: 520, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
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
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>{title}</div>
          <div style={{ fontSize: 13, color: "#6ee7b7", marginTop: 6, fontWeight: 500, lineHeight: 1.6 }}>{subtitle}</div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 18,
            padding: 18,
            backdropFilter: "blur(10px)"
          }}
        >
          <div style={{ fontSize: 12, color: "rgba(148,163,184,0.92)", lineHeight: 1.7 }}>
            <div style={{ fontWeight: 900, color: "#e2e8f0", marginBottom: 6 }}>Quick setup</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Create a Supabase project and copy your <span style={{ color: "#e2e8f0", fontWeight: 800 }}>Project URL</span> and{" "}
                <span style={{ color: "#e2e8f0", fontWeight: 800 }}>anon public key</span>.
              </li>
              <li>
                Create a local env file from <span style={{ color: "#e2e8f0", fontWeight: 800 }}>.env.example</span>.
              </li>
              <li>Restart `vite` so env vars are picked up.</li>
            </ol>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <Link
              to="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.04)",
                color: "#e2e8f0",
                fontWeight: 850,
                textDecoration: "none"
              }}
            >
              Retry login
            </Link>
            <Link
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg,#10b981,#059669)",
                color: "#fff",
                fontWeight: 900,
                textDecoration: "none",
                boxShadow: "0 4px 16px #10b98140"
              }}
            >
              Go to homepage
            </Link>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: SLATE }}>
            Using palette: <span style={{ color: GREEN, fontWeight: 900 }}>healthcare green</span> +{" "}
            <span style={{ color: "#93c5fd", fontWeight: 900 }}>trust blue</span>.
          </div>
        </div>
      </div>
    </div>
  );
}

