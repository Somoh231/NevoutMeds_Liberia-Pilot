import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { getSupabaseClient } from "@/platform/supabaseClient";
import { syncEngine, type SyncState } from "@/platform/offline/sync";
import { tenantKey } from "@/platform/offline/db";
import { deviceId, enqueue, listQueue, newIdempotencyKey, removeEntry, type MutationType, type QueuedMutation } from "@/platform/offline/queue";
import { trackEvent } from "@/platform/reliability/telemetry";

type SyncContextValue = SyncState & {
  tenant: string | null;
  queue: QueuedMutation[];
  /** Queues an offline-capable write and returns its idempotency key. */
  queueMutation: (args: { type: MutationType; payload: Record<string, unknown>; summary: string }) => Promise<string>;
  refresh: () => Promise<void>;
  retryNow: () => void;
  /**
   * Removes a change the server rejected ("Needs attention") from this device,
   * after the person has dealt with it. Only rejected changes can be removed:
   * waiting or failed work always stays queued until it syncs.
   */
  dismissConflict: (localId: string) => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, security } = useAuth();
  const qc = useQueryClient();
  const supabase = useMemo(() => getSupabaseClient(), []);
  // Queued work is replayed only once the session is strong enough for this
  // account (two-step verification done where required). Before that the server
  // would refuse it, and a refusal must never turn saved work into a "failure".
  const tenant = security.satisfied ? tenantKey(user?.pharmacyId ?? null, user?.id ? String(user.id) : null) : null;

  const [state, setState] = useState<SyncState>(syncEngine.getState());
  const [queue, setQueue] = useState<QueuedMutation[]>([]);

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  // Reconnecting: drain the queue first, then refetch server state. A device
  // that was offline for hours cannot rely on realtime to replay what it missed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      syncEngine.kick();
      // Give the queue a moment to land before reading server state back.
      setTimeout(() => void qc.invalidateQueries(), 1_500);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [qc]);

  // Switching account or pharmacy re-points the engine and drops the in-memory
  // query cache, so nothing from the previous tenant can be shown.
  useEffect(() => {
    qc.clear();
    syncEngine.setContext(supabase, tenant);
    if (tenant) void listQueue(tenant).then(setQueue);
    else setQueue([]);
  }, [tenant, supabase, qc]);

  // Refresh the visible queue whenever sync state changes.
  useEffect(() => {
    if (!tenant) return;
    void listQueue(tenant).then(setQueue);
  }, [tenant, state.pending, state.failed, state.conflicts, state.syncing]);

  const value: SyncContextValue = {
    ...state,
    tenant,
    queue,
    async queueMutation({ type, payload, summary }) {
      if (!user?.pharmacyId || !tenant) throw new Error("Finish onboarding before recording work");
      const key = newIdempotencyKey();
      await enqueue({
        idempotency_key: key,
        tenant_key: tenant,
        pharmacy_id: String(user.pharmacyId),
        user_id: String(user.id),
        device_id: deviceId(),
        mutation_type: type,
        payload,
        summary
      });
      const rows = await listQueue(tenant);
      setQueue(rows);
      await syncEngine.refreshCounts();
      syncEngine.kick();
      return key;
    },
    async refresh() {
      if (!tenant) return;
      setQueue(await listQueue(tenant));
      await syncEngine.refreshCounts();
    },
    retryNow() {
      syncEngine.kick();
    },
    async dismissConflict(localId) {
      if (!tenant) return;
      const entry = (await listQueue(tenant)).find((q) => q.local_id === localId);
      if (!entry || entry.status !== "conflict") return;
      await removeEntry(localId);
      setQueue(await listQueue(tenant));
      await syncEngine.refreshCounts();
      if (user?.pharmacyId) {
        void trackEvent({
          pharmacyId: String(user.pharmacyId),
          userId: String(user.id),
          eventName: "sync_conflict_dismissed",
          module: "sync",
          metadata: { mutation_type: entry.mutation_type, summary: entry.summary, reason: String(entry.error_message ?? "").slice(0, 160) }
        });
      }
    }
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
