import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/platform/auth/AuthProvider";
import AuthLayout from "@/platform/auth/AuthLayout";
import { friendlyAuthError } from "@/platform/auth/authMessages";
import SupabaseNotConfiguredScreen from "@/platform/auth/SupabaseNotConfiguredScreen";
import { Alert, Button, FormField, Input, PasswordInput } from "@/platform/ui";
import { MailCheck } from "@/platform/ui/icons";

/** Only same-app paths: never "//host" or "/\host" (open-redirect shapes). */
const safeInternalPath = (p: unknown) => (typeof p === "string" && /^\/(?![/\\])/.test(p) ? p : null);

type Errors = Partial<Record<"name" | "pharmacy" | "email" | "password", string>>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { configured, loading, signInWithPassword, signUpOwner, user, endReason, accountStatus, clearEndReason } = useAuth();

  const redirectTo = useMemo(() => safeInternalPath((location.state as any)?.from) ?? "/platform", [location.state]);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [confirmSent, setConfirmSent] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pharmacy, setPharmacy] = useState("");
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setErr(null);
    setFieldErrors({});
  }, [mode]);

  if (!loading && user) return <Navigate to={redirectTo} replace />;
  if (!loading && !configured)
    return <SupabaseNotConfiguredScreen />;

  const validate = (): Errors => {
    const e: Errors = {};
    if (mode === "signup" && !name.trim()) e.name = "Enter your name.";
    if (mode === "signup" && !pharmacy.trim()) e.pharmacy = "Enter your pharmacy’s name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter the email address you use for NevOut Meds.";
    if (!password) e.password = "Enter your password.";
    else if (mode === "signup" && password.length < 8) e.password = "Use at least 8 characters.";
    return e;
  };

  // A real form: Enter submits, and password managers recognise the fields.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = validate();
    setFieldErrors(v);
    if (Object.keys(v).length) return;
    setErr(null);
    setBusy(true);
    clearEndReason();
    try {
      if (mode === "signup") {
        const { needsConfirmation } = await signUpOwner({ email: email.trim(), password, name: name.trim(), pharmacy: pharmacy.trim() });
        if (needsConfirmation) {
          setConfirmSent(email.trim());
          return;
        }
      } else {
        await signInWithPassword({ email: email.trim(), password });
      }
      navigate(redirectTo, { replace: true });
    } catch (ex) {
      setErr(friendlyAuthError(ex));
    } finally {
      setBusy(false);
    }
  };

  if (confirmSent) {
    return (
      <AuthLayout title="Check your email" subtitle={<>We sent a confirmation link to <strong>{confirmSent}</strong>. Open it on this device to finish creating your pharmacy.</>}>
        <div style={{ display: "grid", gap: 16, marginTop: 24 }}>
          <Alert tone="brand" title="Didn’t get it?">Check spam, or wait a minute and sign up again with the same address.</Alert>
          <Button variant="secondary" block onClick={() => { setConfirmSent(null); setMode("login"); }}>Back to sign in</Button>
        </div>
      </AuthLayout>
    );
  }

  // Why the last session ended, when the user did not choose to leave.
  const notice =
    endReason === "suspended" || accountStatus === "suspended"
      ? { tone: "warning" as const, title: "Your access is paused", body: "Your pharmacy owner has suspended this account. Contact them to restore access." }
      : endReason === "removed" || accountStatus === "removed"
        ? { tone: "warning" as const, title: "You no longer have access", body: "This account was removed from its pharmacy. Contact the pharmacy owner if this is a mistake." }
        : endReason === "expired"
          ? { tone: "info" as const, title: "Your session ended", body: "For your security you were signed out. Sign in again to continue — work saved on this device is kept." }
          : null;

  const signup = mode === "signup";
  return (
    <AuthLayout
      title={signup ? "Create your pharmacy" : "Sign in"}
      subtitle={signup ? "For pharmacy owners. Staff join through the invitation their owner sends." : "Welcome back. Sign in to your pharmacy workspace."}
      footer={
        signup ? (
          <span className="nv-hint" style={{ fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            Already have an account?
            <button type="button" className="nv-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setMode("login")}>Sign in instead</button>
          </span>
        ) : (
          <>
            <Link to="/forgot-password" className="nv-link">Forgot your password?</Link>
            <button type="button" className="nv-link nv-link--quiet" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setMode("signup")}>
              New pharmacy? Create an account
            </button>
          </>
        )
      }
    >
      <form className="nv-auth__form" onSubmit={submit} noValidate aria-describedby={err ? "login-error" : undefined}>
        {notice && !err && <Alert tone={notice.tone} title={notice.title}>{notice.body}</Alert>}
        {err && (
          <div id="login-error">
            <Alert tone="danger">{err}</Alert>
          </div>
        )}
        {signup && (
          <>
            <FormField label="Your name" required error={fieldErrors.name}>
              <Input ref={firstField} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </FormField>
            <FormField label="Pharmacy name" required error={fieldErrors.pharmacy}>
              <Input value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} autoComplete="organization" />
            </FormField>
          </>
        )}
        <FormField label="Email" required error={fieldErrors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="name@pharmacy.com" />
        </FormField>
        <FormField label="Password" required error={fieldErrors.password} hint={signup ? "At least 8 characters." : undefined}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? "new-password" : "current-password"} />
        </FormField>
        <Button type="submit" variant="primary" size="lg" block loading={busy || loading}>
          {signup ? "Create account" : "Sign in"}
        </Button>
        {signup && (
          <p className="nv-hint" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <MailCheck size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            You’ll set up your pharmacy’s details on the next step.
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
