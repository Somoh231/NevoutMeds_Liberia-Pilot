import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmt } from "@/platform/utils/format";
import { Badge, Button, Dialog, EmptyState, FormField, Input, PageHeader, SectionHeader, StatusBadge, Alert } from "@/platform/ui";
import { UserPlus, Users } from "@/platform/ui/icons";
import { can } from "@/platform/auth/capabilities";
import { useAuth } from "@/platform/auth/AuthProvider";
import { useStaffPerformance } from "@/platform/data/useStaffPerformance";
import { fetchStaffAuditLog, fetchStaffInvitations, fetchStaffMembers, staffAdmin } from "@/platform/data/staffAdmin";
import { tenantDate, tenantDateTime } from "@/platform/country/tenant";

// Phase 4: real staff records, real invitations, real audit trail. Every
// privileged action goes through the staff-admin Edge Function, which re-checks
// permissions in the database — the UI is convenience, not security.
const STATUS_BADGE = {
  active: { tone: "success", label: "Active" },
  suspended: { tone: "warning", label: "Suspended" },
  removed: { tone: "neutral", label: "Offboarded" },
  pending: { tone: "info", label: "Invitation pending" },
  accepted: { tone: "success", label: "Accepted" },
  expired: { tone: "danger", label: "Expired" },
  revoked: { tone: "neutral", label: "Cancelled" }
};

function Status({ status }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.removed;
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

const ROLE_LABEL = { owner: "Owner", staff: "Staff", admin: "Administrator" };
const CONFIRM = {
  suspend: { verb: "Suspend", text: "They lose access immediately, even if they are signed in right now. Their past sales and stock records stay exactly as they are." },
  remove: { verb: "Offboard", text: "They lose access immediately and permanently. Their past sales, stock changes and documents remain on record with their name." },
  reset_mfa: { verb: "Reset", text: "Do this only after you have confirmed, in person or by a call you placed yourself, that they lost their phone. Their authenticator is removed; at their next sign-in they use their password and set up a new app if their role requires it. This is recorded in the security log." }
};
// The role an owner can switch a member to (role assignment, not authorisation).
const ROLE_TOGGLE = { owner: "staff", staff: "owner" };
const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const AUDIT_LABEL = {
  invitation_created: "invited",
  invitation_resent: "re-sent invitation to",
  invitation_revoked: "cancelled invitation for",
  invitation_accepted: "joined the pharmacy",
  user_suspended: "suspended",
  user_reactivated: "reactivated",
  user_removed: "offboarded",
  role_changed: "changed the role of"
};

export default function StaffScreen({ onShowToast }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pharmacyId = user?.pharmacyId;
  // What this person may do here comes from their capabilities; the database and the
  // staff-admin Edge Function refuse anything else.
  const canInvite = can(user, "staff.invite");
  const canManage = can(user, "staff.manage");
  const canChangeRole = can(user, "staff.role.manage");
  const canReadAudit = can(user, "staff.audit.read");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "staff" });
  const [inviteLink, setInviteLink] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const perfQ = useStaffPerformance(7);
  const membersQ = useQuery({
    queryKey: ["staffMembers", pharmacyId],
    enabled: !!pharmacyId,
    queryFn: () => fetchStaffMembers(pharmacyId)
  });
  const invitesQ = useQuery({
    queryKey: ["staffInvitations", pharmacyId],
    enabled: !!pharmacyId && canInvite,
    queryFn: () => fetchStaffInvitations(pharmacyId)
  });
  const auditQ = useQuery({
    queryKey: ["staffAudit", pharmacyId],
    enabled: !!pharmacyId && canReadAudit,
    queryFn: () => fetchStaffAuditLog(pharmacyId)
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["staffMembers", pharmacyId] }),
      qc.invalidateQueries({ queryKey: ["staffInvitations", pharmacyId] }),
      qc.invalidateQueries({ queryKey: ["staffAudit", pharmacyId] }),
      qc.invalidateQueries({ queryKey: ["staffPerformance", pharmacyId] })
    ]);
  };

  const act = useMutation({
    mutationFn: async ({ kind, payload }) => {
      if (kind === "invite") return staffAdmin.invite(payload);
      if (kind === "resend") return staffAdmin.resend(payload.invitationId);
      if (kind === "revoke") return staffAdmin.revoke(payload.invitationId);
      if (kind === "suspend") return staffAdmin.suspend(payload.userId);
      if (kind === "reactivate") return staffAdmin.reactivate(payload.userId);
      if (kind === "remove") return staffAdmin.remove(payload.userId);
      if (kind === "role") return staffAdmin.setRole(payload.userId, payload.role);
      if (kind === "reset_mfa") return staffAdmin.resetMfa(payload.userId);
      throw new Error("unknown action");
    },
    onSuccess: async (data, vars) => {
      await refresh();
      if (vars.kind === "invite" || vars.kind === "resend") {
        setInviteLink({ url: data.accept_url, emailed: data.emailed, email: vars.payload.email });
        onShowToast(data.emailed ? "Invitation sent" : "Invitation created — share the link", "success");
      } else {
        onShowToast("Team updated", "success");
      }
      setConfirming(null);
    },
    onError: (e) => onShowToast(e?.message || "That action was not allowed", "error")
  });

  const members = membersQ.data ?? [];
  const activeMembers = members.filter((m) => m.status !== "removed");
  const perfById = Object.fromEntries((perfQ.data ?? []).map((p) => [p.user_id, p]));
  const invites = invitesQ.data ?? [];
  const pendingInvites = invites.filter((i) => i.status === "pending" || i.status === "expired");
  const totSales = (perfQ.data ?? []).reduce((s, p) => s + p.sales_total, 0);

  const suspendedCount = members.filter((m) => m.status === "suspended").length;
  const auditRows = auditQ.data ?? [];

  return (
    <div className="nv-page nv-team">
      <PageHeader
        title="Your team"
        description={
          <>
            {activeMembers.length} member{activeMembers.length === 1 ? "" : "s"} · {pendingInvites.length} pending invitation{pendingInvites.length === 1 ? "" : "s"}
            {membersQ.isFetching && <span> · Syncing…</span>}
          </>
        }
        actions={canInvite && (
          <Button variant="primary" icon={<UserPlus size={18} aria-hidden="true" />} onClick={() => { setForm({ email: "", name: "", role: "staff" }); setInviteLink(null); setInviteOpen(true); }}>
            Invite team member
          </Button>
        )}
      />

      <dl className="nv-pulse nv-pulse--4 nv-team__pulse" aria-label="Team at a glance">
        <div><dt>Team sales (7d)</dt><dd className="nv-figure-lg">{perfQ.isLoading ? "…" : fmt(totSales)}</dd></div>
        <div><dt>Active members</dt><dd className="nv-figure-lg">{activeMembers.filter((m) => m.status === "active").length}</dd></div>
        <div><dt>Suspended</dt><dd className="nv-figure-lg">{suspendedCount}</dd></div>
        <div><dt>Pending invitations</dt><dd className="nv-figure-lg">{pendingInvites.length}</dd></div>
      </dl>

      <section aria-labelledby="team-members-h" className="nv-team__section">
        <SectionHeader title={<span id="team-members-h">Members</span>} description="Each person signs in with their own login, so every sale and stock change shows who made it." />
        {members.length === 0 && !membersQ.isFetching ? (
          <EmptyState
            icon={<Users size={26} />}
            title="No team members yet"
          >
            Each person gets their own login, so every sale and stock change shows who made it. Invite your first staff member to get started.
          </EmptyState>
        ) : (
          <ul className="nv-members">
            {members.map((m) => {
              const perf = perfById[m.id];
              const isSelf = String(m.id) === String(user?.id);
              // Platform administrators are never managed from a pharmacy (the server refuses it too).
              const manageable = canManage && !isSelf && m.status !== "removed" && !can(m, "platform.admin");
              const privileged = can(m, "staff.manage");
              return (
                <li key={m.id} className={`nv-member${m.status === "removed" ? " is-removed" : ""}`}>
                  <span className={`nv-member__avatar nv-member__avatar--${privileged ? "owner" : "staff"}`} aria-hidden="true">{initials(m.name)}</span>
                  <div className="nv-member__who">
                    <p className="nv-member__name">{m.name}{isSelf && <span className="nv-member__you"> (you)</span>}</p>
                    <p className="nv-member__email">{m.email ?? "No email recorded"}</p>
                    <div className="nv-member__tags">
                      <Status status={m.status} />
                      <Badge tone={privileged ? "brand" : "neutral"}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
                    </div>
                    <p className="nv-member__seen">
                      Joined {tenantDate(m.joined_at)}{m.last_seen_at ? ` · last active ${tenantDate(m.last_seen_at)}` : " · not signed in yet"}
                    </p>
                  </div>
                  <div className="nv-member__perf">
                    {perf ? (
                      <>
                        <span className="nv-figure">{fmt(perf.sales_total)}</span>
                        <span className="nv-member__perfnote">{perf.transactions} sale{perf.transactions === 1 ? "" : "s"} · 7 days</span>
                      </>
                    ) : (
                      <span className="nv-member__perfnote">No sales in 7 days</span>
                    )}
                  </div>
                  {manageable && (
                    <div className="nv-member__actions" role="group" aria-label={`Manage ${m.name}`}>
                      {m.status === "active" ? (
                        <Button size="sm" onClick={() => setConfirming({ kind: "suspend", member: m })}>Suspend</Button>
                      ) : (
                        <Button size="sm" onClick={() => act.mutate({ kind: "reactivate", payload: { userId: m.id } })}>Reactivate</Button>
                      )}
                      {canChangeRole && ROLE_TOGGLE[m.role] && (
                        <Button size="sm" variant="ghost" onClick={() => act.mutate({ kind: "role", payload: { userId: m.id, role: ROLE_TOGGLE[m.role] } })}>
                          Make {ROLE_TOGGLE[m.role]}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setConfirming({ kind: "reset_mfa", member: m })}>Reset two-step</Button>
                      <Button size="sm" variant="ghost" className="nv-member__danger" onClick={() => setConfirming({ kind: "remove", member: m })}>Offboard</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canInvite && invites.length > 0 && (
        <section aria-labelledby="team-invites-h" className="nv-team__section">
          <SectionHeader title={<span id="team-invites-h">Invitations</span>} description="An invitation link works once and expires. Resend it if it has expired." />
          <ul className="nv-card nv-card--flush nv-invites">
            {invites.map((inv) => (
              <li key={inv.id} className="nv-invite">
                <div className="nv-invite__who">
                  <p className="nv-invite__email">{inv.email}</p>
                  <p className="nv-invite__meta">{ROLE_LABEL[inv.role] ?? inv.role} · sent {tenantDate(inv.created_at)} · expires {tenantDate(inv.expires_at)}</p>
                </div>
                <Status status={inv.status} />
                {(inv.status === "pending" || inv.status === "expired") && (
                  <div className="nv-invite__actions">
                    <Button size="sm" onClick={() => act.mutate({ kind: "resend", payload: { invitationId: inv.id, email: inv.email } })}>Resend</Button>
                    <Button size="sm" variant="ghost" className="nv-member__danger" onClick={() => act.mutate({ kind: "revoke", payload: { invitationId: inv.id } })}>Cancel</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canReadAudit && auditRows.length > 0 && (
        <section aria-labelledby="team-log-h" className="nv-team__section">
          <SectionHeader title={<span id="team-log-h">Team activity log</span>} description="Who changed what, and when. This record cannot be edited." />
          <div className="nv-card">
            <ol className="nv-activity">
              {auditRows.map((a) => (
                <li key={a.id} className="nv-activity__item">
                  <div className="nv-activity__row">
                    <span className="nv-activity__what">
                      <b>{a.actor_email ?? "system"}</b> {AUDIT_LABEL[a.action] ?? a.action} <b>{a.target_email ?? a.new_value?.email ?? ""}</b>
                      {a.action === "role_changed" && a.previous_value?.role && a.new_value?.role ? ` (${a.previous_value.role} → ${a.new_value.role})` : ""}
                      <small>{tenantDateTime(a.created_at)}</small>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        width={520}
        title="Invite a team member"
        description={<>They’ll join <b>{user?.pharmacy ?? "your pharmacy"}</b> with the role you choose. Only you can change roles later.</>}
      >
        {!inviteLink ? (
          <form
            className="nv-stack"
            onSubmit={(e) => { e.preventDefault(); if (form.email.trim()) act.mutate({ kind: "invite", payload: { email: form.email.trim(), name: form.name.trim(), role: form.role } }); }}
          >
            <FormField label="Full name">
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Their full name" autoComplete="name" />
            </FormField>
            <FormField label="Email" required>
              <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="their@email.com" autoComplete="email" inputMode="email" />
            </FormField>
            <fieldset className="nv-role-pick">
              <legend>Role</legend>
              {["staff", "owner"].map((r) => (
                <label key={r} className={`nv-role-pick__opt${form.role === r ? " is-on" : ""}`}>
                  <input type="radio" name="invite-role" value={r} checked={form.role === r} onChange={() => setForm((p) => ({ ...p, role: r }))} />
                  <span className="nv-role-pick__name">{ROLE_LABEL[r]}</span>
                  <span className="nv-role-pick__hint">{r === "owner" ? "Everything, including money and the team" : "Sales, stock and customers"}</span>
                </label>
              ))}
            </fieldset>
            <p className="nv-hint">Platform administrator cannot be granted from here.</p>
            <Button type="submit" variant="primary" block loading={act.isPending} disabled={!form.email.trim()}>
              {act.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        ) : (
          <div className="nv-stack">
            <Alert tone="success">
              {inviteLink.emailed ? `Invitation emailed to ${inviteLink.email}.` : `Invitation created for ${inviteLink.email}.`} You can also send this link directly — it works once and expires.
            </Alert>
            <FormField label="Invitation link">
              <Input readOnly value={inviteLink.url} onFocus={(e) => e.target.select()} />
            </FormField>
            <div className="nv-team__share">
              <Button onClick={() => { navigator.clipboard?.writeText(inviteLink.url); onShowToast("Invitation link copied", "success"); }}>Copy link</Button>
              <a
                className="nv-btn"
                href={`https://wa.me/?text=${encodeURIComponent(`Join ${user?.pharmacy ?? "our pharmacy"} on NevOut Meds: ${inviteLink.url}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
            </div>
            <Button variant="primary" block onClick={() => setInviteOpen(false)}>Done</Button>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        width={460}
        title={confirming ? `${CONFIRM[confirming.kind].verb} ${confirming.member.name}${confirming.kind === "reset_mfa" ? "’s two-step verification" : ""}?` : ""}
        description={confirming ? CONFIRM[confirming.kind].text : undefined}
        footer={confirming && (
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button variant="danger" loading={act.isPending} onClick={() => act.mutate({ kind: confirming.kind, payload: { userId: confirming.member.id } })}>
              {act.isPending ? "Working…" : CONFIRM[confirming.kind].verb}
            </Button>
          </>
        )}
      />
    </div>
  );
}
