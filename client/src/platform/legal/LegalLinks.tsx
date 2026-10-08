import { Link } from "react-router-dom";

/** Public legal pages. Signed-out routes; also reachable from inside the app. */
export const LEGAL_PAGES = [
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
  { to: "/cookies", label: "Cookies" }
] as const;

/**
 * "Privacy · Terms · Cookies": a small, quiet line of links for footers
 * (public site, signed-out pages, Help & feedback).
 */
export default function LegalLinks({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  return (
    <nav className={["nv-legal-links", className].filter(Boolean).join(" ")} aria-label="Legal">
      {LEGAL_PAGES.map((p, i) => (
        <span key={p.to}>
          {i > 0 && <span className="nv-legal-links__sep" aria-hidden="true"> · </span>}
          <Link to={p.to} onClick={onNavigate}>{p.label}</Link>
        </span>
      ))}
    </nav>
  );
}
