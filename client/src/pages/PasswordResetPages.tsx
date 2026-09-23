import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import AuthLayout from "@/platform/auth/AuthLayout";
import { friendlyAuthError } from "@/platform/auth/authMessages";
import { Alert, Button, EmptyState, FormField, Input, PasswordInput } from "@/platform/ui";
import { CircleCheck, Clock, KeyRound, MailCheck } from "@/platform/ui/icons";

const backToSignIn = <Link to="/login" className="nv-link">Back to sign in</Link>;

export function ForgotPasswordPage() {
  const { requestPasswordReset, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const value = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(value)) return setFieldError("Enter the email address you sign in with.");
    setFieldError(undefined);
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(value);
      setSent(value);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your email" back={null} footer={backToSignIn}>
        <EmptyState icon={<MailCheck size={26} />} tone="brand" title="Reset link on its way">
          {/* Deliberately does not reveal whether the address has an account. */}
          If <strong>{sent}</strong> belongs to a NevOut Meds account, you’ll get a link to choose a new password. It expires after a short time.
        </EmptyState>
        <Button block onClick={() => setSent(null)}>Use a different email</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we’ll send you a link to choose a new password." footer={backToSignIn} back={null}>
      {!configured ? (
        <div style={{ marginTop: 24 }}><Alert tone="warning">Password reset isn’t available on this installation yet.</Alert></div>
      ) : (
        <form className="nv-auth__form" onSubmit={submit} noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <FormField label="Email" required error={fieldError}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" placeholder="name@pharmacy.com" />
          </FormField>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { updatePassword, session, configured, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  // The recovery link signs the user in from the URL; give that a moment
  // before declaring the link invalid.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next = {
      password: password.length < 8 ? "Use at least 8 characters." : undefined,
      confirm: password !== confirm ? "The two passwords don’t match." : undefined
    };
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Password updated" back={null}>
        <EmptyState icon={<CircleCheck size={26} />} tone="success" title="You’re all set">
          Use your new password next time you sign in.
        </EmptyState>
        <Link to="/platform" className="nv-btn nv-btn--primary nv-btn--lg nv-btn--block">Open your workspace</Link>
      </AuthLayout>
    );
  }

  if (!configured) {
    return (
      <AuthLayout title="Choose a new password" back={null} footer={backToSignIn}>
        <div style={{ marginTop: 24 }}><Alert tone="warning">Password reset isn’t available on this installation yet.</Alert></div>
      </AuthLayout>
    );
  }

  if (!session && (loading || !waited)) {
    return (
      <AuthLayout title="Choose a new password" back={null}>
        <div role="status" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 24, color: "var(--nv-text-secondary)" }}>
          <span className="nv-spinner" aria-hidden="true" /> Checking your reset link…
        </div>
      </AuthLayout>
    );
  }

  if (!session) {
    return (
      <AuthLayout title="This link has expired" back={null} footer={backToSignIn}>
        <EmptyState icon={<Clock size={26} />} tone="warning" title="Reset links only work once, for a short time">
          Request a new link and open it on this device.
        </EmptyState>
        <Link to="/forgot-password" className="nv-btn nv-btn--primary nv-btn--lg nv-btn--block">Send a new reset link</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Pick something you don’t use anywhere else." back={null}>
      <form className="nv-auth__form" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="New password" required error={errors.password} hint="At least 8 characters.">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="Repeat new password" required error={errors.confirm}>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </FormField>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<KeyRound size={18} aria-hidden="true" />}>Save new password</Button>
      </form>
    </AuthLayout>
  );
}
