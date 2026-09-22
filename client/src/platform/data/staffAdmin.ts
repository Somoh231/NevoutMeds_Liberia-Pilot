import { getSupabaseClient } from "@/platform/supabaseClient";
import { getSupabaseDb } from "@/platform/data/supabaseDb";
import type { UUID } from "@/platform/db/types";

export type StaffMember = {
  id: UUID;
  name: string;
  email: string | null;
  role: "owner" | "staff" | "admin";
  status: "active" | "suspended" | "removed";
  joined_at: string;
  last_seen_at: string | null;
};

export type StaffInvitation = {
  id: UUID;
  email: string;
  name: string | null;
  role: "owner" | "staff";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
};

export type AuditEntry = {
  id: UUID;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
};

function invitationStatus(row: any): StaffInvitation["status"] {
  if (row.revoked_at) return "revoked";
  if (row.accepted_at) return "accepted";
  if (new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "pending";
}

export async function fetchStaffMembers(pharmacyId: UUID): Promise<StaffMember[]> {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("users_profiles")
    .select("id,name,email,role,status,joined_at,last_seen_at")
    .eq("pharmacy_id", pharmacyId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StaffMember[];
}

export async function fetchStaffInvitations(pharmacyId: UUID): Promise<StaffInvitation[]> {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("staff_invitations")
    .select("id,email,name,role,created_at,expires_at,accepted_at,revoked_at")
    .eq("pharmacy_id", pharmacyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, status: invitationStatus(r) }));
}

export async function fetchStaffAuditLog(pharmacyId: UUID): Promise<AuditEntry[]> {
  const db = getSupabaseDb();
  const { data, error } = await db
    .from("staff_audit_log")
    .select("id,action,actor_email,target_email,previous_value,new_value,created_at")
    .eq("pharmacy_id", pharmacyId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

/**
 * Calls the trusted staff-admin Edge Function. The browser never holds a
 * service-role key: it sends the signed-in user's own access token, and the
 * function re-checks every permission in the database before doing anything
 * privileged.
 */
async function callStaffAdmin<T>(payload: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured");
  const { data, error } = await client.functions.invoke("staff-admin", {
    body: { ...payload, app_origin: window.location.origin }
  });
  if (error) {
    // Surface the function's own message (e.g. "only the pharmacy owner …").
    let message = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") message = (await ctx.json())?.error ?? message;
    } catch {
      // keep the original message
    }
    throw new Error(message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export const staffAdmin = {
  invite: (args: { email: string; name?: string; role: "staff" | "owner" }) =>
    callStaffAdmin<{ invitation_id: string; accept_url: string; emailed: boolean; expires_at: string }>({
      action: "invite",
      ...args
    }),
  resend: (invitationId: UUID) =>
    callStaffAdmin<{ accept_url: string; emailed: boolean }>({ action: "resend", invitation_id: invitationId }),
  revoke: (invitationId: UUID) => callStaffAdmin<{ ok: true }>({ action: "revoke", invitation_id: invitationId }),
  suspend: (userId: UUID) => callStaffAdmin<{ ok: true }>({ action: "suspend", user_id: userId }),
  reactivate: (userId: UUID) => callStaffAdmin<{ ok: true }>({ action: "reactivate", user_id: userId }),
  remove: (userId: UUID) => callStaffAdmin<{ ok: true }>({ action: "remove", user_id: userId }),
  setRole: (userId: UUID, role: "staff" | "owner") =>
    callStaffAdmin<{ ok: true }>({ action: "set_role", user_id: userId, role })
};

export async function acceptInvitation(token: string) {
  const db = getSupabaseDb();
  const { data, error } = await db.rpc("accept_staff_invitation", { p_token: token });
  if (error) throw error;
  return data as { pharmacy_id: string; role: string };
}
