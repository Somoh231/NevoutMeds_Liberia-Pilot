import { Link } from "react-router-dom";
import LegalLayout, { Mail } from "./LegalLayout";
import { PrivacyPreferencesLink } from "@/platform/privacy/PrivacyPreferences";

const TECHNOLOGIES = [
  {
    name: "Sign-in session (browser local storage)",
    purpose: "Keeps you signed in securely and lets the app talk to our servers on your behalf.",
    when: "After you sign in. Removed when you sign out."
  },
  {
    name: "Offline app data (IndexedDB)",
    purpose: "A copy of the pharmacy records you can see, so the app keeps working without a connection.",
    when: "After you sign in. Removed when you sign out."
  },
  {
    name: "Offline changes queue (IndexedDB)",
    purpose: "Saves sales and other changes made offline until they can be synchronised, so nothing is lost.",
    when: "Kept until the changes are sent, even after sign-out."
  },
  {
    name: "Device identifier (browser local storage)",
    purpose: "A random code that labels this device’s offline changes for reliable synchronisation. It stays on the device and is not used to track you.",
    when: "Created the first time you save work. Stays on the device."
  },
  {
    name: "App cache (service worker)",
    purpose: "Stores the app’s own code and images so it loads quickly and opens without a connection. It holds no pharmacy or customer records.",
    when: "Created on your first visit. Updated when a new version is available."
  },
  {
    name: "Privacy preferences (browser local storage)",
    purpose: "Remembers that you have seen our privacy notice, so it is not shown again. It holds no account, pharmacy or customer information.",
    when: "When you choose “Got it” or save your preferences. Stays on the device."
  }
];

export default function CookiesPage() {
  return (
    <LegalLayout title="Cookies & Similar Technologies" eyebrow="NevOut Meds">
      <p className="nv-legal__lede">
        NevOut Meds does not use advertising cookies, advertising trackers, marketing pixels, behavioural advertising or third-party analytics
        trackers.
      </p>
      <p>
        The app does use a few necessary browser and device technologies. Most are not cookies. They support sign-in, security, offline
        operation, synchronisation and app performance.
      </p>

      <h2>Technologies we use</h2>
      <div className="nv-legal__table-wrap" role="region" aria-label="Technologies we use" tabIndex={0}>
        <table className="nv-legal__table">
          <thead>
            <tr><th scope="col">Technology</th><th scope="col">Why it is needed</th><th scope="col">When it is used</th></tr>
          </thead>
          <tbody>
            {TECHNOLOGIES.map((t) => (
              <tr key={t.name}><th scope="row">{t.name}</th><td>{t.purpose}</td><td>{t.when}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        These technologies are provided by NevOut Meds itself and are needed for the services you use. Information stored on your device stays
        there, except what the app sends to our servers to sign you in and to save your pharmacy’s work.
      </p>

      <h2>Your preferences</h2>
      <p>
        You can review these technologies at any time in <PrivacyPreferencesLink />, linked in the footer of our website and in Help &amp;
        feedback in the app.
      </p>

      <h2>Shared devices</h2>
      <p>
        If several people use the same device, each person should sign out at the end of their shift. Lock the device when you step away. Signing
        out removes the sign-in session and the offline copy of the pharmacy’s records from that device.
      </p>

      <h2>Removing stored information</h2>
      <p>
        You can remove the information stored by NevOut Meds through your browser’s settings, by clearing the site data for nevoutmeds.com. If
        you do this before offline changes have been synchronised, those changes will be lost.
      </p>

      <h2>Future changes</h2>
      <p>
        If NevOut later introduces optional analytics, advertising, or other non-essential tracking technologies, this notice and any required
        choices or consent controls will be updated before those technologies are used.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <Mail to="privacy" />. See also our <Link to="/privacy">Privacy Notice</Link>.
      </p>
    </LegalLayout>
  );
}
