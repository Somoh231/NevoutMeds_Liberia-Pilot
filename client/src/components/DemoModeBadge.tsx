import { useAuth } from "@/platform/auth/AuthProvider";

export default function DemoModeBadge() {
  const { configured } = useAuth();
  if (configured) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(2,6,23,0.78)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "rgba(255,255,255,0.92)",
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: "0.02em",
        backdropFilter: "blur(10px)"
      }}
    >
      Demo Mode
    </div>
  );
}

