import { FONT } from "@/platform/constants";

export default function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: FONT,
        background: "#fff"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#334155", fontWeight: 900 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 0 6px rgba(16,185,129,0.15)"
          }}
        />
        {label}
      </div>
    </div>
  );
}

