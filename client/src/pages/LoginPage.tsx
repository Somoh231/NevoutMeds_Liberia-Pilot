import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/platform/auth/AuthProvider";
import AuthLayout from "@/platform/auth/AuthLayout";
import { friendlyAuthError } from "@/platform/auth/authMessages";
import SupabaseNotConfiguredScreen from "@/platform/auth/SupabaseNotConfiguredScreen";
import NoAccountHelp from "@/platform/auth/NoAccountHelp";
import { Alert, Button, FormField, Input, PasswordInput } from "@/platform/ui";

/** Only same-app paths: never "//host" or "/\host" (open-redirect shapes). */
const safeInternalPath = (p: unknown) => (typeof p === "string" && /^\/(?![/\\])/.test(p) ? p : null);

type Errors = Partial<Record<"email" | "password", string>>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { configured, loading, signInWithPassword, user, endReason, accountStatus, clearEndReason } = useAuth();

  const redirectTo = useMemo(() => safeInternalPath((location.state as any)?.from) ?? "/platform", [location.state]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!loading && user) return <Navigate to={redirectTo} replace />;
  if (!loading && !configured)
    return <SupabaseNotConfiguredScreen />;

  const validate = (): Errors => {
    const e: Errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter the email address you use for NevOut Meds.";
    if (!password) e.password = "Enter your password.";
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
      await signInWithPassword({ email: email.trim(), password });
      navigate(redirectTo, { replace: true });
    } catch (ex) {
      setErr(friendlyAuthError(ex));
    } finally {
      setBusy(false);
    }
  };

  // Why the last session ended, when the user did not choose to leave.
  const notice =
    endReason === "suspended" || accountStatus === "suspended"
      ? { tone: "warning" as const, title: "Your access is paused", body: "Your pharmacy owner has suspended this account. Contact them to restore access." }
      : endReason === "removed" || accountStatus === "removed"
        ? { tone: "warning" as const, title: "You no longer have access", body: "This account was removed from its pharmacy. Contact the pharmacy owner if this is a mistake." }
        : endReason === "expired"
          ? { tone: "info" as const, title: "Your session ended", body: "For your security you were signed out. Sign in again to continue — work saved on this device is kept." }
          : endReason === "signed_out_locally"
            ? { tone: "warning" as const, title: "Signed out on this device only", body: "There was no connection, so your session could not be ended on the server. This device no longer has access. If you think someone else may have your sign-in details or another device, ask your pharmacy owner to suspend and reactivate your account." }
            : null;

  // Public self-service sign-up is disabled for the pilot (accounts are
  // provisioned for pharmacies; staff join by invitation), so this page only
  // signs people in and points everyone else to support.
  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Sign in to your pharmacy workspace."
      footer={
        <>
          <Link to="/forgot-password" className="nv-link">Forgot your password?</Link>
          <NoAccountHelp />
        </>
      }
    >
      <form className="nv-auth__form" onSubmit={submit} noValidate aria-describedby={err ? "login-error" : undefined}>
        {notice && !err && <Alert tone={notice.tone} title={notice.title}>{notice.body}</Alert>}
        {err && (
          <div id="login-error">
            <Alert tone="danger">{err}</Alert>
          </div>
        )}
        <FormField label="Email" required error={fieldErrors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="name@pharmacy.com" />
        </FormField>
        <FormField label="Password" required error={fieldErrors.password}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </FormField>
        <Button type="submit" variant="primary" size="lg" block loading={busy || loading}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
