import { STORE_META, idbGet, idbPut, isIndexedDbAvailable } from "@/platform/offline/db";

/**
 * Offline authorisation policy.
 *
 * A device that has already signed in keeps a snapshot of *who it is* — user id,
 * pharmacy, role and last known account status — so the pharmacy can keep
 * working through an outage. This is deliberately a cache of a previous
 * server decision, never a new one:
 *
 *   * it only unlocks the local UI and the local queue;
 *   * every queued write is still authorised by the server when it syncs, so a
 *     suspended or offboarded user's queued work is rejected then;
 *   * on reconnect the server's answer replaces it, and a suspended account is
 *     signed out.
 */
export type ProfileSnapshot = {
  key: string;
  user_id: string;
  pharmacy_id: string;
  role: "owner" | "staff" | "admin";
  name: string;
  /** Optional: snapshots saved before Phase 8 do not have it. */
  pharmacy_name?: string;
  status: string;
  saved_at: string;
};

const keyFor = (userId: string) => `profile:${userId}`;

export async function saveProfileSnapshot(p: Omit<ProfileSnapshot, "key" | "saved_at">) {
  if (!isIndexedDbAvailable()) return;
  try {
    await idbPut(STORE_META, { ...p, key: keyFor(p.user_id), saved_at: new Date().toISOString() });
  } catch {
    // Never let a storage problem break sign-in.
  }
}

export async function readProfileSnapshot(userId: string): Promise<ProfileSnapshot | null> {
  if (!isIndexedDbAvailable()) return null;
  try {
    return await idbGet<ProfileSnapshot>(STORE_META, keyFor(userId));
  } catch {
    return null;
  }
}

/** Offline continuation is refused for an account already known to be blocked. */
export function snapshotAllowsOfflineUse(snapshot: ProfileSnapshot | null) {
  return !!snapshot && snapshot.status === "active";
}
