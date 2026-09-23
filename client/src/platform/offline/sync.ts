import type { SupabaseClient } from "@supabase/supabase-js";
import {
  backoffMs,
  isRetryable,
  listQueue,
  pruneSynced,
  updateEntry,
  type QueuedMutation
} from "@/platform/offline/queue";

/**
 * The reconnect engine.
 *
 * Event-driven rather than polled: it reacts to the browser's online/offline
 * signals, to the tab becoming visible again, and to new work being queued. The
 * only timer is the backoff for a failed entry, so an idle app on a metered 3G
 * connection makes no background requests at all.
 */
export type SyncState = {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  conflicts: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

type Listener = (state: SyncState) => void;

const RPC_FOR: Record<QueuedMutation["mutation_type"], string> = {
  record_purchase: "record_purchase_idempotent",
  adjust_stock: "adjust_stock_idempotent",
  create_customer: "create_customer_idempotent",
  create_reminder: "create_reminder_idempotent",
  create_product: "create_product_idempotent",
  create_purchase_order: "create_purchase_order_idempotent"
};

export class SyncEngine {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  /** Identifies this page session's in-flight sends (see QueuedMutation.syncing_session). */
  private readonly sessionId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random()}`;
  private tenant: string | null = null;
  private client: SupabaseClient | null = null;
  private state: SyncState = {
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    syncing: false,
    pending: 0,
    failed: 0,
    conflicts: 0,
    lastSyncAt: null,
    lastError: null
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
      document.addEventListener("visibilitychange", this.handleVisibility);
    }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState() {
    return this.state;
  }

  setContext(client: SupabaseClient | null, tenant: string | null) {
    this.client = client;
    this.tenant = tenant;
    void this.refreshCounts();
    if (tenant) void this.run("context");
  }

  private emit(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private handleOnline = () => {
    this.emit({ online: true });
    void this.run("online");
  };

  private handleOffline = () => this.emit({ online: false });

  private handleVisibility = () => {
    if (document.visibilityState === "visible" && this.state.online) void this.run("visible");
  };

  async refreshCounts() {
    if (!this.tenant) return this.emit({ pending: 0, failed: 0, conflicts: 0 });
    const rows = await listQueue(this.tenant);
    this.emit({
      pending: rows.filter((r) => r.status === "pending" || r.status === "syncing").length,
      failed: rows.filter((r) => r.status === "failed").length,
      conflicts: rows.filter((r) => r.status === "conflict").length
    });
  }

  /** Confirms the backend actually answers — "online" only means a network exists. */
  private async backendReachable(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const { error } = await this.client.rpc("my_account_status");
      return !error || !this.isNetworkError(error);
    } catch {
      return false;
    }
  }

  private isNetworkError(error: unknown) {
    const message = (error as { message?: string })?.message ?? "";
    return /failed to fetch|network|timeout|load failed|offline/i.test(message);
  }

  /** Drains the queue oldest-first. Safe to call repeatedly. */
  async run(reason: string): Promise<void> {
    if (this.running || !this.tenant || !this.client) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const queued = (await listQueue(this.tenant)).filter(
      (r) =>
        r.status === "pending" ||
        (r.status === "failed" && this.dueForRetry(r)) ||
        // Stranded by a closed or crashed session mid-request. Resending is
        // safe: the idempotency key makes the server apply it exactly once
        // (a replay returns the first attempt's result).
        (r.status === "syncing" && r.syncing_session !== this.sessionId)
    );
    if (queued.length === 0) {
      await this.refreshCounts();
      await pruneSynced(this.tenant);
      return;
    }

    if (!(await this.backendReachable())) {
      this.scheduleRetry(5_000);
      return;
    }

    this.running = true;
    this.emit({ syncing: true, lastError: null });

    try {
      for (const entry of queued) {
        // Order matters: a purchase queued before a stock adjustment must be
        // applied in that order, so stop at the first blocking failure.
        const outcome = await this.send(entry);
        if (outcome === "retry-later") break;
      }
      this.emit({ lastSyncAt: new Date().toISOString() });
    } finally {
      this.running = false;
      this.emit({ syncing: false });
      await this.refreshCounts();
      await pruneSynced(this.tenant!);
      const remaining = (await listQueue(this.tenant!)).filter((r) => r.status === "failed");
      if (remaining.length > 0) this.scheduleRetry(backoffMs(Math.min(...remaining.map((r) => r.retry_count))));
    }
  }

  private dueForRetry(entry: QueuedMutation) {
    if (!entry.last_attempt_at) return true;
    return Date.now() - new Date(entry.last_attempt_at).getTime() >= backoffMs(entry.retry_count);
  }

  private scheduleRetry(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run("backoff"), ms);
  }

  private async send(entry: QueuedMutation): Promise<"done" | "retry-later" | "rejected"> {
    const client = this.client!;
    await updateEntry(entry, { status: "syncing", syncing_session: this.sessionId, last_attempt_at: new Date().toISOString() });

    try {
      const { error } = await client.rpc(RPC_FOR[entry.mutation_type], {
        ...entry.payload,
        p_idempotency_key: entry.idempotency_key
      });

      if (!error) {
        await updateEntry(entry, { status: "synced", synced_at: new Date().toISOString(), error_code: null, error_message: null });
        return "done";
      }

      const code = (error as { code?: string }).code ?? null;
      const status = (error as { status?: number }).status ?? null;

      if (this.isNetworkError(error) || isRetryable(status, code)) {
        await updateEntry(entry, {
          status: "failed",
          retry_count: entry.retry_count + 1,
          error_code: code,
          error_message: error.message
        });
        this.emit({ lastError: error.message });
        return "retry-later";
      }

      // Permanently rejected by the server: a conflict the person must see
      // (stale product version, insufficient stock, suspended account …).
      await updateEntry(entry, {
        status: "conflict",
        retry_count: entry.retry_count + 1,
        error_code: code,
        error_message: error.message,
        conflict: { rejected_at: new Date().toISOString(), reason: error.message }
      });
      return "rejected";
    } catch (e) {
      await updateEntry(entry, {
        status: "failed",
        retry_count: entry.retry_count + 1,
        error_code: null,
        error_message: e instanceof Error ? e.message : "network error"
      });
      return "retry-later";
    }
  }

  /** Called after new work is queued, so a connected device syncs immediately. */
  kick() {
    void this.run("enqueue");
  }
}

export const syncEngine = new SyncEngine();
