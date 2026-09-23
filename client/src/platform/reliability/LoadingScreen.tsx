import { BrandMark } from "@/platform/shell/Brand";

/** Full-screen wait state. Announced to screen readers; no layout shift when the app arrives. */
export default function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="nv-app nv-full-center">
      <div role="status" aria-live="polite" style={{ display: "grid", justifyItems: "center", gap: 16 }}>
        <BrandMark size={40} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--nv-text-secondary)", fontWeight: 600 }}>
          <span className="nv-spinner" aria-hidden="true" />
          {label}
        </div>
      </div>
    </div>
  );
}
