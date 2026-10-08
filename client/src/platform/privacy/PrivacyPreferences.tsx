import "./privacy.css";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, Dialog } from "@/platform/ui";
import { ChartNoAxesColumn, Check, ChevronDown, Lock, Megaphone, ShieldCheck, WifiOff } from "@/platform/ui/icons";
import { OPEN_EVENT, PREFS_KEY, needsNotice, openPrivacyPreferences, saveAcknowledgment } from "./preferences";

/**
 * The first-visit notice appears on the public site only. It never covers a
 * sign-in, verification, password or workspace screen: those stay exactly as
 * they were, and the preferences stay reachable from Help & feedback.
 */
const NOTICE_ROUTES = new Set(["/", "/privacy", "/terms", "/cookies"]);

/** Where focus goes when the control that had it disappears (the notice was dismissed). */
function focusMain() {
  const main = document.getElementById("main");
  if (!main) return;
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
}

/**
 * Privacy & Cookie Preferences, mounted once for the whole app: the first-visit
 * notice and the preferences panel. Nothing waits on it; the page renders and
 * works whether or not the visitor ever answers.
 */
export default function PrivacyPreferences() {
  const { pathname } = useLocation();
  const [pending, setPending] = useState(() => needsNotice());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    // Another tab acknowledged (or the record was cleared): follow it.
    const onStorage = (e: StorageEvent) => { if (e.key === PREFS_KEY || e.key === null) setPending(needsNotice()); };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // If the browser will not store it, the notice still goes away for this visit.
  const acknowledge = () => {
    saveAcknowledgment();
    setPending(false);
  };

  // There are no choices to save yet: "Done" records that the panel was read and closes it.
  const done = () => {
    acknowledge();
    setOpen(false);
    // The dialog returns focus to whatever opened it; if that was the notice, it is gone now.
    requestAnimationFrame(() => { if (document.activeElement === document.body) focusMain(); });
  };

  return (
    <>
      {pending && NOTICE_ROUTES.has(pathname) && (
        <PrivacyNotice
          onAcknowledge={(hadFocus) => {
            acknowledge();
            if (hadFocus) requestAnimationFrame(focusMain);
          }}
          onManage={openPrivacyPreferences}
        />
      )}
      <PreferencesDialog open={open} onClose={() => setOpen(false)} onDone={done} />
    </>
  );
}

function PrivacyNotice({ onAcknowledge, onManage }: { onAcknowledge: (hadFocus: boolean) => void; onManage: () => void }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  return (
    <section ref={ref} className="nv-privacy-notice" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
      <div className="nv-privacy-notice__head">
        <span className="nv-privacy-notice__icon" aria-hidden="true"><ShieldCheck size={18} /></span>
        <h2 id={`${id}-t`} className="nv-privacy-notice__title">Privacy &amp; site preferences</h2>
      </div>
      <p id={`${id}-d`} className="nv-privacy-notice__body">
        NevOut uses essential browser storage and related technologies to keep the service secure, support sign-in, and enable offline
        functionality. We do not use advertising trackers.
      </p>
      <div className="nv-privacy-notice__actions">
        <Button variant="primary" onClick={() => onAcknowledge(!!ref.current?.contains(document.activeElement))}>Got it</Button>
        <Button onClick={onManage}>Manage preferences</Button>
      </div>
      <nav className="nv-privacy-notice__links" aria-label="Privacy notices">
        <Link to="/privacy">Privacy</Link>
        <Link to="/cookies">Cookies</Link>
        <Link to="/terms">Terms</Link>
      </nav>
    </section>
  );
}

function PreferencesDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const id = useId();
  const [details, setDetails] = useState(false);
  useEffect(() => { if (!open) setDetails(false); }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={640}
      className="nv-pp-dialog"
      title="Privacy & Cookie Preferences"
      description="NevOut uses limited browser storage and related technologies to provide secure sign-in, offline functionality, synchronization, and core application features. We currently do not use advertising or behavioral tracking technologies."
      footer={<Button variant="primary" onClick={onDone}>Done</Button>}
    >
      <div className="nv-pp">
        <ul className="nv-pp__list">
          <li className="nv-pp__cat">
            <span className="nv-pp__icon" aria-hidden="true"><Lock size={18} /></span>
            <div className="nv-pp__main">
              <div className="nv-pp__row">
                <h3 className="nv-pp__name">Essential</h3>
                <span className="nv-pp__badge"><Check size={14} aria-hidden="true" />Always active</span>
              </div>
              <p>Required for secure sign-in, session handling, security controls, and core site functionality.</p>
            </div>
          </li>
          <li className="nv-pp__cat">
            <span className="nv-pp__icon" aria-hidden="true"><WifiOff size={18} /></span>
            <div className="nv-pp__main">
              <div className="nv-pp__row">
                <h3 className="nv-pp__name">Offline functionality</h3>
                <span className="nv-pp__badge"><Check size={14} aria-hidden="true" />Required for offline features</span>
              </div>
              <p>
                Stores selected application information on this device so pharmacy workflows can continue during unreliable connectivity and
                synchronize when the connection returns.
              </p>
              <button
                type="button"
                className="nv-pp__more"
                aria-expanded={details}
                aria-controls={`${id}-more`}
                onClick={() => setDetails((v) => !v)}
              >
                Learn more
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              <div id={`${id}-more`} className="nv-pp__details" hidden={!details}>
                <p>After someone signs in on a device, the app keeps:</p>
                <ul>
                  <li>a copy of the pharmacy records that person can see, in the browser’s database (IndexedDB);</li>
                  <li>changes made offline, queued until they can be sent;</li>
                  <li>a random device code in local storage that labels those changes (it is not used to track you).</li>
                </ul>
                <p>Signing out removes the session and the copy of the records. Unsent changes stay until they are sent, so sales are not lost.</p>
                <p>
                  On any visit, a service worker caches the app’s own code and images so it opens quickly and without a connection. That cache
                  holds no pharmacy or customer records.
                </p>
              </div>
            </div>
          </li>
        </ul>

        <section className="nv-pp__unused" aria-labelledby={`${id}-unused`}>
          <h3 id={`${id}-unused`} className="nv-pp__overline">Not used on NevOut</h3>
          <div className="nv-pp__mini">
            <span className="nv-pp__icon nv-pp__icon--muted" aria-hidden="true"><ChartNoAxesColumn size={16} /></span>
            <div className="nv-pp__main">
              <div className="nv-pp__row">
                <h4 className="nv-pp__name nv-pp__name--sm">Optional analytics</h4>
                <span className="nv-pp__badge nv-pp__badge--off">Not currently used</span>
              </div>
              <p>NevOut does not currently use optional analytics or behavioral tracking technologies.</p>
            </div>
          </div>
          <div className="nv-pp__mini">
            <span className="nv-pp__icon nv-pp__icon--muted" aria-hidden="true"><Megaphone size={16} /></span>
            <div className="nv-pp__main">
              <div className="nv-pp__row">
                <h4 className="nv-pp__name nv-pp__name--sm">Advertising &amp; marketing</h4>
                <span className="nv-pp__badge nv-pp__badge--off">Not used</span>
              </div>
              <p>No advertising cookies, marketing pixels or behavioral advertising.</p>
            </div>
          </div>
          <p className="nv-pp__note">
            If NevOut ever introduces optional technologies like these, this panel and our Cookies notice will be updated before they are used.
          </p>
        </section>

        <p className="nv-pp__note">
          Your preferences are remembered in this browser only and contain no account, pharmacy or customer information. Service records and
          error reports that keep the platform reliable are described in the Privacy Notice.
        </p>

        <nav className="nv-pp__links" aria-label="Privacy documents">
          <Link to="/privacy" onClick={onClose}>Privacy Notice</Link>
          <Link to="/cookies" onClick={onClose}>Cookies &amp; Similar Technologies</Link>
          <Link to="/terms" onClick={onClose}>Terms of Use</Link>
        </nav>
      </div>
    </Dialog>
  );
}

/** "Privacy & Cookie Preferences" as a footer-style link that reopens the panel. */
export function PrivacyPreferencesLink({ className, children = "Privacy & Cookie Preferences" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={["nv-pp-link", className].filter(Boolean).join(" ")} aria-haspopup="dialog" onClick={openPrivacyPreferences}>
      {children}
    </button>
  );
}
