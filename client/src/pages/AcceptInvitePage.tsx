import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/platform/auth/AuthProvider";
import AuthLayout from "@/platform/auth/AuthLayout";
import { friendlyAuthError, friendlyInviteError, inviteErrorKind } from "@/platform/auth/authMessages";
import { acceptInvitation } from "@/platform/data/staffAdmin";
import LoadingScreen from "@/platform/reliability/LoadingScreen";
import { Alert, Button, EmptyState, FormField, Input, PasswordInput, Tabs, tabPanelProps } from "@/platform/ui";
import { Ban, CircleCheck, Clock, TriangleAlert, UserPlus } from "@/platform/ui/icons";

/**
 * Staff acceptance. The token in the URL is only a lookup key: the pharmacy and
 * the role come from the invitation row server-side, so nothing here can choose
 * a tenant or grant itself a role.
 */
export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { configured, loading, user, session, signInWithPassword, signUpForInvitation, signOut } = useAuth();
  const token = useMemo(() => (params.get("token") ?? "").trim(), [params]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [accepted, setAccepted] = useState(false);
  const [mode, setMode] = useState<"signin" | "create">("signin");
  // Account created but the email must be confirmed first (production requires it).
  const [confirmSent, setConfirmSent] = useState<string | null>(null);

  // Signed in and holding a token: accept once. A ref guards the request —
  // keeping `busy` in this effect's dependencies used to re-run the effect,
  // whose cleanup cancelled the in-flight acceptance, so the page hung on
  // "Confirming…" even though the server had accepted the invitation.
  const acceptStarted = useRef(false);
  useEffect(() => {
    if (!session) {
      acceptStarted.current = false; // signed out (e.g. wrong email): allow a fresh attempt
      return;
    }
    if (!token || acceptStarted.current) return;
    acceptStarted.current = true;
    setBusy(true);
    acceptInvitation(token)
      .then(() => {
        setAccepted(true);
        // Reload so the profile (pharmacy + role) is picked up everywhere.
        window.location.assign("/platform");
      })
      .catch((e) => setError(e))
      .finally(() => setBusy(false));
  }, [token, session]);

  if (loading) return <LoadingScreen label="Checking your invitation…" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next = {
      email: /^\S+@\S+\.\S+$/.test(email.trim()) ? undefined : "Enter the email address the invitation was sent to.",
      password: !password ? "Enter a password." : mode === "create" && password.length < 8 ? "Use at least 8 characters." : undefined
    };
    setFieldErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    setFormError(null);
    try {
      if (mode === "create") {
        const { needsConfirmation } = await signUpForInvitation({
          email: email.trim(),
          password,
          returnTo: `/accept-invite?token=${encodeURIComponent(token)}`
        });
        if (needsConfirmation) setConfirmSent(email.trim());
      } else await signInWithPassword({ email: email.trim(), password });
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (confirmSent && !session) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={<>We sent a confirmation link to <strong>{confirmSent}</strong>.</>}
        back={null}
        footer={<Link to="/login" className="nv-link">Go to sign in</Link>}
      >
        <div className="nv-stack" style={{ marginTop: 24 }}>
          <Alert tone="info">
            Open the link in that email on this device. It brings you back to this invitation and finishes joining your pharmacy.
            If the email doesn’t arrive within a few minutes, ask your pharmacy owner to contact NevOut Meds support.
          </Alert>
        </div>
      </AuthLayout>
    );
  }

  // ── Link problems ─────────────────────────────────────────────────────
  if (!token) {
    return (
      <AuthLayout title="Invitation link incomplete" back={null} footer={<Link to="/login" className="nv-link">Go to sign in</Link>}>
        <EmptyState icon={<TriangleAlert size={26} />} tone="warning" title="This link is missing its invitation code">
          Open the full link from your invitation message, or ask your pharmacy owner to send it again.
        </EmptyState>
      </AuthLayout>
    );
  }
  if (!configured) {
    return (
      <AuthLayout title="Join your pharmacy" back={null}>
        <div style={{ marginTop: 24 }}><Alert tone="warning">Invitations can’t be accepted on this installation yet.</Alert></div>
      </AuthLayout>
    );
  }

  if (error) {
    const kind = inviteErrorKind(error);
    const Icon = kind === "expired" ? Clock : kind === "revoked" || kind === "has-pharmacy" ? Ban : TriangleAlert;
    const title =
      kind === "expired" ? "This invitation has expired"
      : kind === "revoked" ? "This invitation was cancelled"
      : kind === "used" ? "This invitation was already used"
      : kind === "wrong-email" ? "Signed in with a different email"
      : kind === "has-pharmacy" ? "You already belong to a pharmacy"
      : kind === "invalid" ? "This invitation link isn’t valid"
      : "We couldn’t accept this invitation";
    return (
      <AuthLayout title={title} back={null}>
        <EmptyState icon={<Icon size={26} />} tone={kind === "used" ? "info" : "warning"} title={friendlyInviteError(error)} />
        <div style={{ display: "grid", gap: 8 }}>
          {kind === "wrong-email" && (
            <Button variant="primary" block onClick={async () => { await signOut(); setError(null); }}>Sign out and use the invited email</Button>
          )}
          {user?.pharmacyId && <Button block onClick={() => navigate("/platform")}>Continue to your workspace</Button>}
          {!user?.pharmacyId && kind !== "wrong-email" && <Link to="/login" className="nv-btn nv-btn--block">Go to sign in</Link>}
        </div>
      </AuthLayout>
    );
  }

  if (session) {
    return (
      <AuthLayout title={accepted ? "You’re in" : "Joining your pharmacy"} back={null}>
        <div role="status" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 24, color: "var(--nv-text-secondary)" }}>
          {accepted ? <CircleCheck size={20} aria-hidden="true" color="var(--nv-success)" /> : <span className="nv-spinner" aria-hidden="true" />}
          {accepted ? "Opening your pharmacy workspace…" : "Confirming your invitation…"}
        </div>
      </AuthLayout>
    );
  }

  // ── Not signed in: sign in or create an account, then accept ─────────
  return (
    <AuthLayout
      title="Join your pharmacy"
      subtitle="You’ve been invited to a NevOut Meds workspace. Your pharmacy and role come from the invitation."
      back={null}
    >
      <div style={{ marginTop: 24 }}>
        <Tabs
          idBase="invite"
          label="Account"
          block
          value={mode}
          onChange={(m) => { setMode(m); setFormError(null); setFieldErrors({}); }}
          tabs={[
            { id: "signin", label: "I have an account" },
            { id: "create", label: "Create my account" }
          ]}
        />
      </div>
      <form className="nv-auth__form" style={{ marginTop: 20 }} onSubmit={submit} noValidate {...tabPanelProps("invite", mode)}>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField label="Email" required error={fieldErrors.email} hint="Use the address your invitation was sent to.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" />
        </FormField>
        <FormField label="Password" required error={fieldErrors.password} hint={mode === "create" ? "At least 8 characters." : undefined}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "create" ? "new-password" : "current-password"} />
        </FormField>
        <Button type="submit" variant="primary" size="lg" block loading={busy} icon={<UserPlus size={18} aria-hidden="true" />}>
          {mode === "create" ? "Create account and join" : "Sign in and join"}
        </Button>
        {mode === "signin" && <Link to="/forgot-password" className="nv-link" style={{ justifyContent: "center" }}>Forgot your password?</Link>}
      </form>
    </AuthLayout>
  );
}
