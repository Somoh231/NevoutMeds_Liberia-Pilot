import { STORE_QUEUE, idbDelete, idbGetAllByIndex, idbPut, isIndexedDbAvailable } from "@/platform/offline/db";

export type QueueStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

export type MutationType =
  | "record_purchase"
  | "adjust_stock"
  | "create_customer"
  | "create_reminder"
  | "create_product"
  | "create_purchase_order";

export type QueuedMutation = {
  local_id: string;
  /** Sent to the server; makes a replay a no-op instead of a duplicate. */
  idempotency_key: string;
  tenant_key: string;
  pharmacy_id: string;
  user_id: string;
  device_id: string;
  mutation_type: MutationType;
  payload: Record<string, unknown>;
  status: QueueStatus;
  retry_count: number;
  created_at: string;
  last_attempt_at: string | null;
  synced_at: string | null;
  error_code: string | null;
  error_message: string | null;
  conflict: Record<string, unknown> | null;
  /** Human-readable, shown in the pending list ("Sale — Ada A, US$3.00"). */
  summary: string;
  /**
   * The sync session (one per page load) that marked this entry "syncing".
   * An entry left "syncing" by a session that no longer exists — the app was
   * closed or crashed mid-request — is retried by the next session.
   */
  syncing_session?: string | null;
};

const DEVICE_KEY = "nevoutmeds_device_id";

export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}

export async function enqueue(entry: Omit<QueuedMutation, "local_id" | "status" | "retry_count" | "created_at" | "last_attempt_at" | "synced_at" | "error_code" | "error_message" | "conflict">): Promise<QueuedMutation> {
  const record: QueuedMutation = {
    ...entry,
    local_id: crypto.randomUUID(),
    status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
    last_attempt_at: null,
    synced_at: null,
    error_code: null,
    error_message: null,
    conflict: null
  };
  await idbPut(STORE_QUEUE, record);
  return record;
}

export async function listQueue(tenant: string): Promise<QueuedMutation[]> {
  if (!isIndexedDbAvailable()) return [];
  const rows = await idbGetAllByIndex<QueuedMutation>(STORE_QUEUE, "by_tenant", tenant);
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function updateEntry(entry: QueuedMutation, patch: Partial<QueuedMutation>) {
  const next = { ...entry, ...patch };
  await idbPut(STORE_QUEUE, next);
  return next;
}

export async function removeEntry(localId: string) {
  await idbDelete(STORE_QUEUE, localId);
}

/** Successful entries are kept briefly so the UI can show "Synced", then pruned. */
export async function pruneSynced(tenant: string, keepMs = 60_000) {
  const rows = await listQueue(tenant);
  const cutoff = Date.now() - keepMs;
  await Promise.all(
    rows
      .filter((r) => r.status === "synced" && r.synced_at && new Date(r.synced_at).getTime() < cutoff)
      .map((r) => removeEntry(r.local_id))
  );
}

/** Exponential backoff with jitter: 5s, 10s, 20s … capped at 10 minutes. */
export function backoffMs(retryCount: number) {
  const base = Math.min(5_000 * 2 ** retryCount, 600_000);
  return base + Math.floor(Math.random() * 1_000);
}

/**
 * Decides whether a rejected mutation is worth retrying.
 *
 * Network trouble and 5xx are transient. A SQLSTATE the database raised on
 * purpose is not: a suspended account, a tenant mismatch, a failed check or a
 * stale version will be rejected identically forever, so the entry becomes a
 * conflict the person can see instead of retrying silently for hours.
 */
const PERMANENT_SQLSTATES = new Set([
  "42501", // insufficient privilege — suspended/offboarded, or wrong tenant
  "PT409", // version conflict (PostgREST status override)
  "P0001" // raise_exception: our own validation messages
]);

export function isRetryable(status: number | null, code: string | null) {
  if (code === "40001") return true; // genuine serialization failure — safe to retry
  if (code) {
    if (PERMANENT_SQLSTATES.has(code)) return false;
    // 22xxx data exceptions and 23xxx integrity violations are permanent too.
    if (/^2[23]/.test(code)) return false;
  }
  if (status === null) return true; // no HTTP status: treat as a transport failure
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;
  return false;
}
