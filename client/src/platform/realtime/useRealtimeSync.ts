import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { getSupabaseClient } from "@/platform/supabaseClient";

/**
 * Same-pharmacy realtime.
 *
 * One channel per pharmacy carrying the operational tables only — never audit
 * logs, invitations, receipts or documents. Every subscription is filtered by
 * `pharmacy_id` server-side and RLS still applies, so a pharmacy cannot receive
 * another pharmacy's events even if a filter were wrong.
 *
 * Events are coalesced: a burst of changes results in one invalidation per
 * affected query key after a short debounce, instead of a refetch per row.
 */
const TABLE_QUERY_KEYS: Record<string, string[]> = {
  inventory: ["inventoryMedicines", "dashboardKpis", "financialSummary"],
  products: ["inventoryMedicines", "dashboardKpis"],
  purchases: ["customers", "dashboardKpis", "financialSummary", "staffPerformance"],
  customers: ["customers", "dashboardKpis"],
  reminders: ["reminders"],
  purchase_orders: ["purchaseOrders"],
  users_profiles: ["staffMembers", "staffPerformance"]
};

const DEBOUNCE_MS = 400;

export function useRealtimeSync() {
  const { user, session } = useAuth();
  const qc = useQueryClient();
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef(new Map<string, number>());

  useEffect(() => {
    const supabase = getSupabaseClient();
    const pharmacyId = user?.pharmacyId;
    if (!supabase || !session || !pharmacyId) return;

    const flush = () => {
      timer.current = null;
      const keys = [...pending.current];
      pending.current.clear();
      for (const key of keys) void qc.invalidateQueries({ queryKey: [key, pharmacyId] });
    };

    const schedule = (table: string, eventId: string) => {
      // Realtime can redeliver; ignore an event id already handled recently.
      const now = Date.now();
      if (seen.current.has(eventId)) return;
      seen.current.set(eventId, now);
      if (seen.current.size > 500) {
        for (const [k, t] of seen.current) if (now - t > 60_000) seen.current.delete(k);
      }
      for (const key of TABLE_QUERY_KEYS[table] ?? []) pending.current.add(key);
      if (!timer.current) timer.current = setTimeout(flush, DEBOUNCE_MS);
    };

    const channel = supabase.channel(`pharmacy:${pharmacyId}`);

    for (const table of Object.keys(TABLE_QUERY_KEYS)) {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter: `pharmacy_id=eq.${pharmacyId}` },
        (payload: any) => {
          const row = payload.new ?? payload.old ?? {};
          // Defence in depth: never act on an event for another pharmacy.
          if (row.pharmacy_id && row.pharmacy_id !== pharmacyId) return;
          const eventId = `${table}:${payload.commit_timestamp ?? ""}:${row.id ?? ""}:${payload.eventType}`;
          schedule(table, eventId);
        }
      );
    }

    // Realtime is a notification transport, not the source of truth. Every time
    // the channel (re)subscribes — first connect, or after a disconnection —
    // everything it watches is refetched from Supabase, because events that
    // happened while the socket was down are never replayed.
    const reconcile = () => {
      for (const keys of Object.values(TABLE_QUERY_KEYS)) {
        for (const key of keys) void qc.invalidateQueries({ queryKey: [key, pharmacyId] });
      }
    };

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") reconcile();
    });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current.clear();
      void supabase.removeChannel(channel);
    };
  }, [user?.pharmacyId, session, qc]);
}
