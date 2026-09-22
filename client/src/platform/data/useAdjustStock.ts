import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { trackEvent } from "@/platform/reliability/telemetry";
import { useSync } from "@/platform/offline/SyncProvider";
import { runOfflineCapableWrite } from "@/platform/offline/offlineMutation";

export function useAdjustStock() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { queueMutation } = useSync();

  return useMutation({
    mutationFn: async (args: { productId: string; productName?: string; delta: number; note?: string }) => {
      if (!user?.pharmacyId) return { status: "queued" as const, idempotencyKey: "" };
      const sign = args.delta > 0 ? "+" : "";
      return runOfflineCapableWrite<number>({
        type: "adjust_stock",
        summary: `Stock ${sign}${args.delta} · ${args.productName ?? "product"}`,
        queueMutation,
        payload: {
          p_pharmacy_id: user.pharmacyId,
          p_product_id: args.productId,
          p_delta: Math.trunc(args.delta),
          p_note: args.note ?? null
        }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventoryMedicines", user?.pharmacyId] });
      if (user?.pharmacyId) {
        void trackEvent({ pharmacyId: user.pharmacyId, userId: String(user.id), eventName: "inventory_adjusted", module: "inventory", metadata: {} });
      }
    }
  });
}
