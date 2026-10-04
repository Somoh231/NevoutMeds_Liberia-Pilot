import { STORE_CACHE, STORE_META, idbClear, idbGet, idbPut, isIndexedDbAvailable } from "@/platform/offline/db";
import type { ResolvedTenantConfig } from "@/platform/country/tenant";

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
  /** Country configuration (Phase 9), so formatting and the till work offline. */
  country?: ResolvedTenantConfig;
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

/**
 * Called whenever this browser has no session (sign-out, a suspended or removed
 * account being signed out, a revoked session, or a start-up with nobody signed
 * in). Cached reads and profile snapshots only serve a *signed-in* session (a
 * new sign-in needs the network and downloads them again), so on a shared
 * device they are removed rather than left readable in browser storage.
 *
 * Queued work is NOT removed: it is the only copy of unsynced sales, stays
 * partitioned by pharmacy and user, and is replayed (and re-authorised by the
 * server) only when that same person signs in again.
 */
export async function forgetSignedOutDeviceData() {
  if (!isIndexedDbAvailable()) return;
  try {
    await Promise.all([idbClear(STORE_CACHE), idbClear(STORE_META)]);
  } catch {
    // Never let a storage problem block signing out.
  }
}

/** Offline continuation is refused for an account already known to be blocked. */
export function snapshotAllowsOfflineUse(snapshot: ProfileSnapshot | null) {
  return !!snapshot && snapshot.status === "active";
}
