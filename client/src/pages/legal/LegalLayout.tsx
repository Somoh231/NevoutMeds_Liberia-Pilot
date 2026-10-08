import "../home.css";
import "./legal.css";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLockup } from "@/platform/shell/Brand";
import { useAuth } from "@/platform/auth/AuthProvider";
import LegalLinks from "@/platform/legal/LegalLinks";
import { PUBLIC_CONTACTS } from "@/platform/support/publicContacts";

/** Date shown on every legal page. Change it whenever the text changes. */
export const LEGAL_LAST_UPDATED = "8 October 2026";

export const CONTACTS = PUBLIC_CONTACTS;

export const Mail = ({ to }: { to: keyof typeof CONTACTS }) => <a href={`mailto:${CONTACTS[to]}`}>{CONTACTS[to]}</a>;

/**
 * Shell for the public legal pages: the public-site header and footer around
 * one readable column. Works signed out and signed in (offers a way back to the
 * workspace when a session exists).
 */
export default function LegalLayout({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  const { user } = useAuth();
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — NevOut Meds`;
    window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, [title]);

  return (
    <div className="nv-site nv-legal-page">
      <a className="nv-skip-link" href="#main">Skip to content</a>
      <header className="nv-site__nav">
        <div className="nv-site__wrap nv-site__navin">
          <Link to="/" aria-label="NevOut Meds home"><BrandLockup size={28} /></Link>
          <div className="nv-site__navcta">
            {user
              ? <Link className="nv-sbtn nv-sbtn--ghost" to="/platform">Back to workspace</Link>
              : <Link className="nv-sbtn nv-sbtn--ghost" to="/login">Sign in</Link>}
          </div>
        </div>
      </header>

      <main id="main" className="nv-legal__main">
        <div className="nv-site__wrap">
          <article className="nv-legal__doc">
            <p className="nv-legal__eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="nv-legal__updated">Last updated: {LEGAL_LAST_UPDATED}</p>
            {children}
          </article>
        </div>
      </main>

      <footer className="nv-site__footer">
        <div className="nv-site__wrap nv-site__footgrid">
          <div>
            <BrandLockup size={26} />
            <p>Pharmacy operations that keep working offline.</p>
          </div>
          <LegalLinks />
          <p className="nv-site__copy">© {new Date().getFullYear()} NevOut Meds</p>
        </div>
      </footer>
    </div>
  );
}
