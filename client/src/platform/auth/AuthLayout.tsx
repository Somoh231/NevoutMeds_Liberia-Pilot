import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLockup } from "@/platform/shell/Brand";
import { ArrowLeft, CircleCheck, ShieldCheck, WifiOff } from "@/platform/ui/icons";

/**
 * Shared presentation for every signed-out page. The left "stage" is the one
 * place the product uses real perspective: layered planes lit from above. It
 * is decorative (aria-hidden), CSS-only, and collapses to a compact header on
 * phones so the form is reachable without scrolling.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  back = { to: "/", label: "NevOut Meds home" }
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  back?: { to: string; label: string } | null;
}) {
  return (
    <div className="nv-app nv-auth">
      <div className="nv-auth__stage nv-on-strong">
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <BrandLockup size={30} onDark />
          {back && (
            <Link to={back.to} className="nv-btn nv-btn--on-strong nv-btn--sm nv-auth__back">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>{back.label}</span>
            </Link>
          )}
        </div>
        <div>
          <p className="nv-auth__headline">Your pharmacy, never out of stock.</p>
          <p className="nv-auth__lede">Stock, sales, refills and cash flow in one place — and it keeps working when the connection doesn’t.</p>
          {/* Sample product states in restrained perspective: the product itself, not slogans. */}
          <div className="nv-auth__scene" aria-hidden="true">
            <span className="nv-auth__sample">Sample</span>
            <div className="nv-auth__planes">
              <div className="nv-plane" style={{ top: 0, left: 0, transform: "translateZ(0px)" }}>
                <div className="nv-plane__label">Decide now</div>
                <div className="nv-plane__value">3 medicines running out</div>
                <div className="nv-plane__bar nv-plane__bar--warn"><i style={{ width: "22%" }} /></div>
              </div>
              <div className="nv-plane" style={{ top: 108, left: 56, transform: "translateZ(40px)" }}>
                <div className="nv-plane__label">Sale recorded · synced</div>
                <div className="nv-plane__value">US$5.40</div>
                <div className="nv-plane__bar"><i style={{ width: "100%" }} /></div>
              </div>
              <div className="nv-plane" style={{ top: 216, left: 112, transform: "translateZ(80px)" }}>
                <div className="nv-plane__label">Offline</div>
                <div className="nv-plane__value">Saved on this device</div>
                <div className="nv-plane__bar"><i style={{ width: "100%" }} /></div>
              </div>
            </div>
          </div>
        </div>
        <p className="nv-auth__foot">Private to your pharmacy. Each pharmacy sees only its own records.</p>
      </div>

      <main className="nv-auth__panel" id="main">
        <div className="nv-auth__card">
          <h1 className="nv-auth__title">{title}</h1>
          {subtitle && <p className="nv-auth__subtitle">{subtitle}</p>}
          {children}
          {footer && <div className="nv-auth__links">{footer}</div>}
        </div>
        <ul className="nv-auth__trust" aria-label="About your account">
          <li><ShieldCheck size={15} aria-hidden="true" /> Private to your pharmacy</li>
          <li><WifiOff size={15} aria-hidden="true" /> Works offline after sign-in</li>
          <li><CircleCheck size={15} aria-hidden="true" /> Every change is recorded</li>
        </ul>
      </main>
    </div>
  );
}
