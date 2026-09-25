import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { can } from "@/platform/auth/capabilities";
import { listTotpFactors, removeFactor } from "@/platform/auth/mfa";
import TotpSetup from "@/platform/auth/TotpSetup";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { tenantDate, tenantDateTime } from "@/platform/country/tenant";
import { Alert, Badge, Button, Card, Dialog, FormField, PageHeader, PasswordInput, SectionHeader, SkeletonBlock, StatusBadge } from "@/platform/ui";
import { KeyRound, LogOut, ShieldCheck, Smartphone } from "@/platform/ui/icons";

const EVENT_LABEL = {
  mfa_enrollment_started: "started setting up an authenticator",
  mfa_factor_verified: "turned on two-step verification",
  mfa_factor_removed: "removed an authenticator",
  mfa_challenge_failed: "entered a wrong verification code",
  mfa_required_not_enrolled: "signed in without two-step verification set up",
  mfa_admin_reset: "had two-step verification reset"
};
const ACTOR_LABEL = { self: "", owner: " by the pharmacy owner", operator: " by NevOut support", system: "" };

/**
 * Account security (Phase 11): the person's own sign-in. Two-step verification
 * (TOTP through Supabase Auth), password, and this device's session. Nothing
 * here is invented: there is no device list because Supabase does not expose one
 * to the browser, and no recovery codes because recovery is a supervised
 * reset (docs/security/MFA_OPERATIONS.md).
 */
export default function SecurityScreen({ onShowToast }) {
  const { user, session, security, refreshSecurity, signOut, updatePassword } = useAuth();
  const supabase = getSupabaseClient();
  const [factors, setFactors] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [replacing, setReplacing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const online = typeof navigator === "undefined" || navigator.onLine !== false;

  const loadFactors = useCallback(async () => {
    if (!supabase) return;
    try {
      setFactors((await listTotpFactors(supabase)).filter((f) => f.status === "verified"));
    } catch {
      setFactors([]);
    }
  }, [supabase]);
  useEffect(() => { void loadFactors(); }, [loadFactors]);

  const readsTeam = can(user, "staff.audit.read");
  const eventsQ = useQuery({
    queryKey: ["securityEvents", user?.id, readsTeam],
    enabled: !!supabase && !!user?.id && online,
    queryFn: async () => {
      let q = supabase.from("security_events").select("id,user_id,actor,event,created_at").order("created_at", { ascending: false }).limit(15);
      if (!readsTeam) q = q.eq("user_id", String(user.id));
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    }
  });
  const teamQ = useQuery({
    queryKey: ["securityEventNames", user?.pharmacyId],
    enabled: readsTeam && !!user?.pharmacyId && online,
    queryFn: async () => {
      const { data } = await supabase.from("users_profiles").select("id,name").eq("pharmacy_id", String(user.pharmacyId));
      return Object.fromEntries((data ?? []).map((m) => [m.id, m.name]));
    }
  });

  const enabled = (factors?.length ?? 0) > 0;
  // Owners must keep one authenticator: they may replace it, never simply remove the last one.
  const mayRemove = (f) => !security.required || (factors?.length ?? 0) > 1;

  const afterChange = async (msg) => {
    await loadFactors();
    await refreshSecurity();
    void eventsQ.refetch();
    onShowToast(msg, "success");
  };

  async function confirmRemove() {
    if (!removing || !supabase) return;
    setBusy(true);
    try {
      await removeFactor(supabase, removing.id);
      setRemoving(null);
      await afterChange("Authenticator removed");
    } catch (e) {
      onShowToast(/aal2|assurance/i.test(String(e?.message)) ? "Sign in again with your code, then try once more." : "The authenticator couldn’t be removed. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  // Replacing: the new authenticator is confirmed first, then the old one is removed.
  async function finishReplace() {
    const old = replacing;
    setReplacing(null);
    if (old && supabase) {
      try { await removeFactor(supabase, old.id); } catch { /* the new one works; the old can be removed later */ }
    }
    await afterChange("New authenticator is set up");
  }

  const status = security.required
    ? enabled ? { tone: "success", label: "On · required" } : { tone: "danger", label: "Required · not set up" }
    : enabled ? { tone: "success", label: "On" } : { tone: "neutral", label: "Off" };

  return (
    <div className="nv-page nv-security">
      <PageHeader title="Account security" description={`${user?.name ?? "Your account"} · ${session?.user?.email ?? ""}`} />

      {!online && <Alert tone="offline" title="You’re offline">Security changes need the internet. Everything else keeps working.</Alert>}

      <Card as="section" aria-labelledby="sec-mfa" className="nv-security__card">
        <div className="nv-security__head">
          <span className="nv-security__icon" aria-hidden="true"><Smartphone size={22} /></span>
          <div className="nv-security__headtext">
            <h2 id="sec-mfa" className="nv-security__title">Two-step verification</h2>
            <p className="nv-hint">
              {security.required
                ? "Required for your role. You sign in with your password and a 6-digit code from an authenticator app."
                : "Optional for your role. Once on, you’ll need a code from your authenticator app every time you sign in."}
            </p>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>

        {factors === null ? (
          <SkeletonBlock label="Loading your authenticators" lines={2} />
        ) : enabled ? (
          <ul className="nv-security__factors">
            {factors.map((f) => (
              <li key={f.id} className="nv-security__factor">
                <div>
                  <p className="nv-security__fname">Authenticator app</p>
                  <p className="nv-hint">Added {tenantDate(f.createdAt)}</p>
                </div>
                <div className="nv-security__factions">
                  <Button size="sm" disabled={!online} onClick={() => setReplacing(f)}>Replace</Button>
                  {mayRemove(f) && <Button size="sm" variant="ghost" className="nv-member__danger" disabled={!online} onClick={() => setRemoving(f)}>Remove</Button>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="nv-security__cta">
            <Button variant="primary" icon={<ShieldCheck size={18} aria-hidden="true" />} disabled={!online} onClick={() => setSetupOpen(true)}>Set up authenticator</Button>
          </div>
        )}
        <details className="nv-security__help">
          <summary>What if I lose my phone?</summary>
          <p>Nobody can turn this off by email or phone call. Staff: your pharmacy owner can reset it for you from Staff. Owners: contact NevOut support, who will confirm who you are before resetting it. Your password and your pharmacy’s records are not affected. Keep your authenticator app’s own backup switched on so a new phone restores your codes.</p>
        </details>
      </Card>

      <PasswordCard updatePassword={updatePassword} onShowToast={onShowToast} online={online} />

      <Card as="section" aria-labelledby="sec-session" className="nv-security__card">
        <div className="nv-security__head">
          <span className="nv-security__icon" aria-hidden="true"><LogOut size={22} /></span>
          <div className="nv-security__headtext">
            <h2 id="sec-session" className="nv-security__title">This device</h2>
            <p className="nv-hint">Signed in{security.aal === "aal2" ? " with two-step verification" : ""}. Sign out when you share this phone or computer.</p>
          </div>
          <Button onClick={() => void signOut()}>Sign out</Button>
        </div>
      </Card>

      <section aria-labelledby="sec-activity" className="nv-security__activity">
        <SectionHeader title={<span id="sec-activity">{readsTeam ? "Security activity in your pharmacy" : "Your security activity"}</span>} description="Codes, keys and passwords are never recorded." />
        {eventsQ.isLoading ? (
          <SkeletonBlock label="Loading security activity" lines={3} />
        ) : (eventsQ.data ?? []).length === 0 ? (
          <p className="nv-hint">{online ? "No security activity yet." : "Security activity needs a connection."}</p>
        ) : (
          <Card>
            <ol className="nv-activity">
              {eventsQ.data.map((e) => {
                const who = e.user_id === user?.id ? "You" : teamQ.data?.[e.user_id] ?? "A team member";
                return (
                  <li key={e.id} className="nv-activity__item">
                    <div className="nv-activity__row">
                      <span className="nv-activity__what">
                        {who} {EVENT_LABEL[e.event] ?? e.event}{ACTOR_LABEL[e.actor] ?? ""}
                        <small>{tenantDateTime(e.created_at)}</small>
                      </span>
                      {e.event === "mfa_challenge_failed" && <Badge tone="warning">Check</Badge>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </section>

      <Dialog open={setupOpen} onClose={() => setSetupOpen(false)} title="Set up your authenticator" width={560}>
        {setupOpen && <TotpSetup onCancel={() => setSetupOpen(false)} onDone={() => { setSetupOpen(false); void afterChange("Two-step verification is on"); }} />}
      </Dialog>

      <Dialog open={!!replacing} onClose={() => setReplacing(null)} title="Replace your authenticator" description="Set up the new app first. Your old one is removed only after the new one works." width={560}>
        {replacing && <TotpSetup onCancel={() => setReplacing(null)} onDone={() => void finishReplace()} />}
      </Dialog>

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove this authenticator?"
        description="You’ll sign in with your password only. You can set up two-step verification again at any time."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => void confirmRemove()}>Remove</Button>
          </>
        }
      />
    </div>
  );
}

function PasswordCard({ updatePassword, onShowToast, online }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don’t match.");
    setBusy(true);
    try {
      await updatePassword(pw);
      setOpen(false);
      setPw("");
      setPw2("");
      onShowToast("Password changed", "success");
    } catch (e2) {
      setErr(/reauth|recent/i.test(String(e2?.message)) ? "For your safety, sign out and in again, then change your password." : String(e2?.message || "The password couldn’t be changed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="sec-pw" className="nv-security__card">
      <div className="nv-security__head">
        <span className="nv-security__icon" aria-hidden="true"><KeyRound size={22} /></span>
        <div className="nv-security__headtext">
          <h2 id="sec-pw" className="nv-security__title">Password</h2>
          <p className="nv-hint">Use a password you don’t use anywhere else. Forgotten passwords are reset through your pharmacy owner or NevOut support during the pilot.</p>
        </div>
        {!open && <Button disabled={!online} onClick={() => setOpen(true)}>Change password</Button>}
      </div>
      {open && (
        <form className="nv-stack nv-security__pwform" onSubmit={submit} noValidate>
          <FormField label="New password" hint="At least 8 characters" error={err ?? undefined}>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </FormField>
          <FormField label="Confirm new password">
            <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </FormField>
          <div className="nv-totp__actions">
            <Button variant="ghost" onClick={() => { setOpen(false); setErr(null); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Save password</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
