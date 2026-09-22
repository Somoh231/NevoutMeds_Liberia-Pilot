import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { trackEvent } from "@/platform/reliability/telemetry";
import { useSync } from "@/platform/offline/SyncProvider";
import { runOfflineCapableWrite } from "@/platform/offline/offlineMutation";

export function useRecordPurchase() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { queueMutation } = useSync();

  return useMutation({
    mutationFn: async (args: {
      customerId: string;
      customerName?: string;
      method: string;
      items: Array<{ productId: string; name: string; qty: number; unitPrice: number }>;
    }) => {
      if (!user?.pharmacyId) return { status: "queued" as const, idempotencyKey: "" };
      const total = args.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      return runOfflineCapableWrite<string>({
        type: "record_purchase",
        summary: `Sale · ${args.customerName ?? "customer"} · ${total.toFixed(2)}`,
        queueMutation,
        payload: {
          p_pharmacy_id: user.pharmacyId,
          p_customer_id: args.customerId,
          p_method: args.method,
          p_staff_id: String(user.id),
          p_items: args.items.map((i) => ({ product_id: i.productId, name: i.name, qty: i.qty, unit_price: i.unitPrice }))
        }
      });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["customers", user?.pharmacyId] }),
        qc.invalidateQueries({ queryKey: ["inventoryMedicines", user?.pharmacyId] }),
        qc.invalidateQueries({ queryKey: ["dashboardKpis", user?.pharmacyId] })
      ]);
      if (user?.pharmacyId) {
        void trackEvent({ pharmacyId: user.pharmacyId, userId: String(user.id), eventName: "purchase_recorded", module: "customers", metadata: {} });
      }
    }
  });
}
