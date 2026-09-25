import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { Alert, Button, FormField, SkeletonBlock } from "@/platform/ui";
import { Check, ShieldCheck } from "@/platform/ui/icons";
import { groupKey, startEnrollment, verifyCode, type Enrollment } from "@/platform/auth/mfa";

/**
 * The 6-digit code field. One real input (not six boxes), so paste, password
 * managers and the phone's own code suggestions all work (WCAG 2.2 accessible
 * authentication; UI/UX Pro Max "Accessible Authentication").
 */
export function CodeField({
  value,
  onChange,
  error,
  label = "6-digit code",
  autoFocus
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <FormField label={label} error={error ?? undefined}>
      <input
        className="nv-input nv-code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        placeholder="123 456"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, ""))}
      />
    </FormField>
  );
}

/**
 * Set up an authenticator app: numbered steps (21st.dev "Enable 2FA Card"
 * pattern), the QR code from Supabase Auth with the key beside it for manual
 * entry ("Two-Factor Authentication Card"), then the first code to confirm.
 * The QR code and key live only in this component's state and disappear once
 * the authenticator is confirmed.
 */
export default function TotpSetup({
  onDone,
  onCancel,
  intro,
  onVerifying
}: {
  onDone: () => void;
  onCancel?: () => void;
  intro?: string;
  /** Called with true just before the code is checked, false if it fails. */
  onVerifying?: (v: boolean) => void;
}) {
  const supabase = getSupabaseClient();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const keyId = useId();
  const started = useRef(false);

  useEffect(() => {
    if (!supabase || started.current) return;
    started.current = true;
    startEnrollment(supabase)
      .then(setEnrollment)
      .catch((e) => {
        const msg = String(e?.message ?? "");
        setLoadError(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "You’re offline. Setting up an authenticator needs the internet."
            : /disabled|not enabled/i.test(msg)
              ? "Two-step verification isn’t switched on for this server yet. Contact NevOut support."
              : "We couldn’t start the setup. Try again in a moment."
        );
      });
  }, [supabase]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !enrollment) return;
    setBusy(true);
    setError(null);
    onVerifying?.(true);
    const r = await verifyCode(supabase, enrollment.factorId, code, { firstTime: true });
    setBusy(false);
    if (r.ok === false) {
      onVerifying?.(false);
      setError(r.message);
      return;
    }
    // Forget the secret the moment it is no longer needed.
    setEnrollment(null);
    setCode("");
    setDone(true);
  }

  if (done) {
    return (
      <div className="nv-totp nv-stack" role="status">
        <div className="nv-totp__done">
          <span className="nv-totp__doneicon" aria-hidden="true"><Check size={22} /></span>
          <div>
            <h3 className="nv-totp__title">Two-step verification is on</h3>
            <p className="nv-hint">From now on you’ll sign in with your password and the code from your authenticator app.</p>
          </div>
        </div>
        <Alert tone="info" title="If you lose your phone">
          Your authenticator can’t be recovered from NevOut Meds. Ask your pharmacy owner, or NevOut support for an owner account, to reset it after they have confirmed who you are. Keep your phone’s own backup (for example iCloud or Google account backup of the app) switched on.
        </Alert>
        <Button variant="primary" block onClick={onDone}>Continue</Button>
      </div>
    );
  }

  return (
    <form className="nv-totp" onSubmit={submit} noValidate>
      {intro && <p className="nv-totp__intro">{intro}</p>}
      <ol className="nv-totp__steps">
        <li className="nv-totp__step">
          <span className="nv-totp__num" aria-hidden="true">1</span>
          <div>
            <h3 className="nv-totp__title">Get an authenticator app</h3>
            <p className="nv-hint">On your own phone: Google Authenticator, Microsoft Authenticator, 1Password, Authy, or the Passwords app on iPhone. Any app that shows 6-digit codes works.</p>
          </div>
        </li>
        <li className="nv-totp__step">
          <span className="nv-totp__num" aria-hidden="true">2</span>
          <div className="nv-totp__body">
            <h3 className="nv-totp__title">Add NevOut Meds to the app</h3>
            <p className="nv-hint">Scan this code with the app, or type the key if you can’t scan.</p>
            {loadError ? (
              <Alert tone="warning">{loadError}</Alert>
            ) : !enrollment ? (
              <SkeletonBlock label="Preparing your setup code" lines={3} />
            ) : (
              <div className="nv-totp__pair">
                <img className="nv-totp__qr" src={enrollment.qrCode} alt="QR code for your authenticator app" width={168} height={168} />
                <div className="nv-totp__manual">
                  <label className="nv-totp__label" htmlFor={keyId}>Can’t scan? Enter this key</label>
                  <div className="nv-totp__keyrow">
                    <code id={keyId} className="nv-totp__key">{groupKey(enrollment.secret)}</code>
                    <Button
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard?.writeText(enrollment.secret).then(() => setCopied(true), () => setCopied(false));
                      }}
                    >
                      {copied ? "Copied" : "Copy key"}
                    </Button>
                  </div>
                  <p className="nv-hint">Choose “time-based” if the app asks. Never share this key or send a screenshot of it.</p>
                </div>
              </div>
            )}
          </div>
        </li>
        <li className="nv-totp__step">
          <span className="nv-totp__num" aria-hidden="true">3</span>
          <div className="nv-totp__body">
            <h3 className="nv-totp__title">Enter the code the app shows</h3>
            <CodeField value={code} onChange={setCode} error={error} />
          </div>
        </li>
      </ol>
      <div className="nv-totp__actions">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={busy} disabled={!enrollment || code.replace(/\D/g, "").length !== 6} icon={<ShieldCheck size={18} aria-hidden="true" />}>
          Turn on two-step verification
        </Button>
      </div>
    </form>
  );
}
