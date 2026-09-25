import { useEffect, useState, type FormEvent } from "react";
import AuthLayout from "@/platform/auth/AuthLayout";
import { useAuth } from "@/platform/auth/AuthProvider";
import TotpSetup, { CodeField } from "@/platform/auth/TotpSetup";
import { primaryFactor, verifyCode, type TotpFactor } from "@/platform/auth/mfa";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { Alert, Button } from "@/platform/ui";
import { LogOut, WifiOff } from "@/platform/ui/icons";

/**
 * The second step of signing in (Phase 11). Shown instead of the workspace
 * until Supabase Auth has upgraded the session to aal2:
 *  - required but not set up → set up an authenticator (owners, admins);
 *  - set up → enter the current code.
 * The database refuses every tenant request until then, so this screen is the
 * friendly face of a rule the server already enforces.
 */
export default function MfaGate() {
  const { security, signOut, refreshSecurity, refreshProfile, mfaSetupShowing, setMfaSetupShowing } = useAuth();
  const needsSetup = (security.required && !security.enrolled) || mfaSetupShowing;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;

  const finish = async () => {
    await refreshSecurity();
    await refreshProfile();
    setMfaSetupShowing(false);
  };

  const signOutLink = (
    <Button variant="ghost" icon={<LogOut size={18} aria-hidden="true" />} onClick={() => void signOut()}>
      Sign out
    </Button>
  );

  if (needsSetup) {
    return (
      <AuthLayout
        back={null}
        title="Protect your pharmacy"
        subtitle={<>Pharmacy owners sign in with a password <strong>and</strong> a code from an app on their phone. Setting it up takes about two minutes, once.</>}
        footer={signOutLink}
      >
        {offline ? (
          <Alert tone="offline" title="You’re offline">Setting up two-step verification needs the internet. Connect, then reload this page.</Alert>
        ) : (
          <TotpSetup onVerifying={setMfaSetupShowing} onDone={() => void finish()} />
        )}
      </AuthLayout>
    );
  }

  return <Challenge onVerified={finish} offline={offline} signOutLink={signOutLink} />;
}

function Challenge({ onVerified, offline, signOutLink }: { onVerified: () => Promise<void>; offline: boolean; signOutLink: JSX.Element }) {
  const supabase = getSupabaseClient();
  const [factor, setFactor] = useState<TotpFactor | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    primaryFactor(supabase).then(setFactor).catch(() => setFactor(null));
  }, [supabase]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    // Submitting before the factor has loaded (slow connection) waits for it rather than doing nothing.
    const f = factor ?? (await primaryFactor(supabase).catch(() => null));
    if (!f) {
      setBusy(false);
      setError("We couldn’t load your authenticator. Check your connection and try again.");
      return;
    }
    if (!factor) setFactor(f);
    const r = await verifyCode(supabase, f.id, code);
    setBusy(false);
    if (r.ok === false) {
      setError(r.message);
      setCode("");
      return;
    }
    await onVerified();
  }

  return (
    <AuthLayout back={null} title="Enter your code" subtitle="Open your authenticator app and enter the 6-digit code for NevOut Meds." footer={signOutLink}>
      {offline ? (
        <Alert tone="offline" title="You’re offline">
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><WifiOff size={16} aria-hidden="true" /> The code must be checked online. Connect to the internet, then enter it.</span>
        </Alert>
      ) : (
        <form className="nv-stack" onSubmit={submit} noValidate style={{ marginTop: 20 }}>
          <CodeField value={code} onChange={setCode} error={error} autoFocus label="Code from your authenticator app" />
          <Button type="submit" variant="primary" block loading={busy} disabled={code.replace(/\D/g, "").length !== 6}>Verify and continue</Button>
          <button type="button" className="nv-link nv-mfa-help" aria-expanded={help} onClick={() => setHelp((h) => !h)}>
            Lost your phone or deleted the app?
          </button>
          {help && (
            <Alert tone="info" title="Getting back in">
              For your pharmacy’s safety, nobody can switch this off by email or phone call. <strong>Staff:</strong> ask your pharmacy owner to reset your two-step verification. <strong>Owners:</strong> contact NevOut support; after they have confirmed who you are, they reset it and you set up a new app. Your password and your pharmacy’s records are not affected.
            </Alert>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
