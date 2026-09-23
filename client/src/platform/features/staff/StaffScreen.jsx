import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FONT, GREEN, SLATE } from "@/platform/constants";
import { fmt, fmtK } from "@/platform/utils/format";
import { Avatar, Modal } from "@/platform/components/primitives";
import { useAuth } from "@/platform/auth/AuthProvider";
import { useStaffPerformance } from "@/platform/data/useStaffPerformance";
import { fetchStaffAuditLog, fetchStaffInvitations, fetchStaffMembers, staffAdmin } from "@/platform/data/staffAdmin";

// Phase 4: real staff records, real invitations, real audit trail. Every
// privileged action goes through the staff-admin Edge Function, which re-checks
// permissions in the database — the UI is convenience, not security.
const COLORS = [GREEN, "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

const STATUS_STYLE = {
  active: { bg: "#f0fdf4", color: "#047857", border: "#bbf7d0", label: "Active" },
  suspended: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa", label: "Suspended" },
  removed: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0", label: "Offboarded" },
  pending: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "Invitation pending" },
  accepted: { bg: "#f0fdf4", color: "#047857", border: "#bbf7d0", label: "Accepted" },
  expired: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca", label: "Expired" },
  revoked: { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0", label: "Cancelled" }
};

function Pill({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.removed;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 900 }}>
      {s.label}
    </span>
  );
}

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
  const isOwner = user?.role === "owner" || user?.role === "admin";

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
    enabled: !!pharmacyId && isOwner,
    queryFn: () => fetchStaffInvitations(pharmacyId)
  });
  const auditQ = useQuery({
    queryKey: ["staffAudit", pharmacyId],
    enabled: !!pharmacyId && isOwner,
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

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: SLATE, letterSpacing: "-0.02em" }}>Your team</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            {activeMembers.length} member{activeMembers.length === 1 ? "" : "s"} · {pendingInvites.length} pending invitation{pendingInvites.length === 1 ? "" : "s"}
            {membersQ.isFetching && <span style={{ color: "#5a6b64", fontWeight: 700 }}> · Syncing…</span>}
          </div>
        </div>
        {isOwner && (
          <button
            onClick={() => { setForm({ email: "", name: "", role: "staff" }); setInviteLink(null); setInviteOpen(true); }}
            style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: GREEN, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}
          >
            + Invite team member
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { l: "Team sales (7d)", v: fmtK(totSales), c: GREEN },
          { l: "Active members", v: activeMembers.filter((m) => m.status === "active").length, c: "#3b82f6" },
          { l: "Suspended", v: members.filter((m) => m.status === "suspended").length, c: "#f59e0b" },
          { l: "Pending invitations", v: pendingInvites.length, c: "#8b5cf6" }
        ].map((s, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 13, padding: "18px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#5a6b64", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Team members */}
      <div style={{ display: "grid", gap: 12, marginBottom: 26 }}>
        {members.length === 0 && !membersQ.isFetching && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px dashed #cbd5e1", padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: SLATE }}>No team members yet</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>Invite your first staff member to get started.</div>
          </div>
        )}
        {members.map((m, i) => {
          const perf = perfById[m.id];
          const isSelf = String(m.id) === String(user?.id);
          return (
            <div key={m.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", opacity: m.status === "removed" ? 0.65 : 1 }}>
              <Avatar name={m.name} size={42} bg={COLORS[i % COLORS.length]} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: SLATE }}>{m.name}</span>
                  <Pill status={m.status} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>{m.role}</span>
                  {isSelf && <span style={{ fontSize: 11, color: "#5a6b64" }}>(you)</span>}
                </div>
                <div style={{ fontSize: 12, color: "#5a6b64", marginTop: 3 }}>
                  {m.email ?? "—"} · joined {new Date(m.joined_at).toLocaleDateString()}
                  {m.last_seen_at ? ` · last active ${new Date(m.last_seen_at).toLocaleDateString()}` : " · not signed in yet"}
                </div>
              </div>
              {perf && (
                <div style={{ textAlign: "right", minWidth: 110 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: GREEN }}>{fmt(perf.sales_total)}</div>
                  <div style={{ fontSize: 10, color: "#5a6b64" }}>{perf.transactions} sales (7d)</div>
                </div>
              )}
              {isOwner && !isSelf && m.status !== "removed" && m.role !== "admin" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {m.status === "active" ? (
                    <button onClick={() => setConfirming({ kind: "suspend", member: m })} style={btn("#f59e0b")}>Suspend</button>
                  ) : (
                    <button onClick={() => act.mutate({ kind: "reactivate", payload: { userId: m.id } })} style={btn(GREEN)}>Reactivate</button>
                  )}
                  <button
                    onClick={() => act.mutate({ kind: "role", payload: { userId: m.id, role: m.role === "owner" ? "staff" : "owner" } })}
                    style={btn("#3b82f6")}
                  >
                    Make {m.role === "owner" ? "staff" : "owner"}
                  </button>
                  <button onClick={() => setConfirming({ kind: "remove", member: m })} style={btn("#ef4444")}>Offboard</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Invitations */}
      {isOwner && invites.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "20px", marginBottom: 26 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, marginBottom: 12 }}>Invitations</div>
          {invites.map((inv) => (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: SLATE }}>{inv.email}</div>
                <div style={{ fontSize: 11, color: "#5a6b64", marginTop: 2 }}>
                  {inv.role} · sent {new Date(inv.created_at).toLocaleDateString()} · expires {new Date(inv.expires_at).toLocaleDateString()}
                </div>
              </div>
              <Pill status={inv.status} />
              {(inv.status === "pending" || inv.status === "expired") && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => act.mutate({ kind: "resend", payload: { invitationId: inv.id, email: inv.email } })} style={btn("#3b82f6")}>Resend</button>
                  <button onClick={() => act.mutate({ kind: "revoke", payload: { invitationId: inv.id } })} style={btn("#ef4444")}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Audit trail */}
      {isOwner && (auditQ.data ?? []).length > 0 && (
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "20px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SLATE, marginBottom: 4 }}>Team activity log</div>
          <div style={{ fontSize: 12, color: "#5a6b64", marginBottom: 12 }}>Who changed what, and when. This record cannot be edited.</div>
          {(auditQ.data ?? []).map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12.5, flexWrap: "wrap" }}>
              <span style={{ color: "#334155" }}>
                <b>{a.actor_email ?? "system"}</b> {AUDIT_LABEL[a.action] ?? a.action} <b>{a.target_email ?? a.new_value?.email ?? ""}</b>
                {a.action === "role_changed" && a.previous_value?.role && a.new_value?.role ? ` (${a.previous_value.role} → ${a.new_value.role})` : ""}
              </span>
              <span style={{ color: "#5a6b64" }}>{new Date(a.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} maxW={520}>
        <div style={{ fontFamily: FONT }}>
          <div style={{ fontSize: 18, fontWeight: 950, color: SLATE, marginBottom: 4 }}>Invite a team member</div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
            They'll join <b>{user?.pharmacy ?? "your pharmacy"}</b> with the role you choose. Only you can change roles later.
          </div>

          {!inviteLink && (
            <div style={{ display: "grid", gap: 10 }}>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" style={inputStyle} />
              <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="their@email.com" style={inputStyle} />
              <div style={{ display: "flex", gap: 8 }}>
                {["staff", "owner"].map((r) => (
                  <button key={r} onClick={() => setForm((p) => ({ ...p, role: r }))} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${form.role === r ? GREEN : "#e2e8f0"}`, background: form.role === r ? "#f0fdf4" : "#fff", fontWeight: 800, cursor: "pointer", fontFamily: FONT, color: "#334155", textTransform: "capitalize" }}>
                    {r}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: "#5a6b64", lineHeight: 1.6 }}>
                Platform administrator cannot be granted from here.
              </div>
              <button
                disabled={act.isPending || !form.email.trim()}
                onClick={() => act.mutate({ kind: "invite", payload: { email: form.email.trim(), name: form.name.trim(), role: form.role } })}
                style={{ padding: "12px", borderRadius: 10, border: "none", background: GREEN, color: "#fff", fontWeight: 900, cursor: "pointer", fontFamily: FONT }}
              >
                {act.isPending ? "Sending…" : "Send invitation"}
              </button>
            </div>
          )}

          {inviteLink && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 14, fontSize: 12.5, color: "#047857", lineHeight: 1.6 }}>
                {inviteLink.emailed ? `Invitation emailed to ${inviteLink.email}.` : `Invitation created for ${inviteLink.email}.`} You can also send this link directly — it works once and expires.
              </div>
              <input readOnly value={inviteLink.url} style={{ ...inputStyle, fontSize: 11.5 }} onFocus={(e) => e.target.select()} />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { navigator.clipboard?.writeText(inviteLink.url); onShowToast("Invitation link copied", "success"); }}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: FONT, color: "#334155" }}
                >
                  Copy link
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Join ${user?.pharmacy ?? "our pharmacy"} on NevOut Meds: ${inviteLink.url}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, textAlign: "center", textDecoration: "none", fontFamily: FONT }}
                >
                  Share on WhatsApp
                </a>
              </div>
              <button onClick={() => setInviteOpen(false)} style={{ padding: "11px", borderRadius: 10, border: "none", background: "#f1f5f9", fontWeight: 800, cursor: "pointer", fontFamily: FONT, color: "#334155" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Confirmations for the destructive actions */}
      <Modal open={!!confirming} onClose={() => setConfirming(null)} maxW={460}>
        {confirming && (
          <div style={{ fontFamily: FONT }}>
            <div style={{ fontSize: 17, fontWeight: 950, color: SLATE, marginBottom: 6 }}>
              {confirming.kind === "suspend" ? "Suspend" : "Offboard"} {confirming.member.name}?
            </div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7, marginBottom: 16 }}>
              {confirming.kind === "suspend"
                ? "They lose access immediately, even if they are signed in right now. Their past sales and stock records stay exactly as they are."
                : "They lose access immediately and permanently. Their past sales, stock changes and documents remain on record with their name."}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirming(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontWeight: 800, cursor: "pointer", fontFamily: FONT, color: "#334155" }}>
                Cancel
              </button>
              <button
                disabled={act.isPending}
                onClick={() => act.mutate({ kind: confirming.kind, payload: { userId: confirming.member.id } })}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: confirming.kind === "suspend" ? "#f59e0b" : "#ef4444", color: "#fff", fontWeight: 900, cursor: "pointer", fontFamily: FONT }}
              >
                {act.isPending ? "Working…" : confirming.kind === "suspend" ? "Suspend" : "Offboard"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 13,
  fontFamily: FONT,
  outline: "none",
  boxSizing: "border-box"
};

function btn(color) {
  return {
    padding: "7px 12px",
    borderRadius: 9,
    border: `1.5px solid ${color}33`,
    background: `${color}12`,
    color,
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: FONT
  };
}
