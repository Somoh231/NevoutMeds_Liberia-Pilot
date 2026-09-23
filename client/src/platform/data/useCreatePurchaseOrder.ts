import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { useSync } from "@/platform/offline/SyncProvider";
import { runOfflineCapableWrite } from "@/platform/offline/offlineMutation";
import { getActiveTenantConfig } from "@/platform/country/tenant";

/**
 * Records a purchase order through the idempotent RPC (Phase 6). Online it is
 * written at once; offline it is queued durably and reported as "queued", so
 * the UI can say "Saved on this device · Pending sync" — never "sent".
 * The server computes the total from the lines; `total` is display-only.
 */
export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { queueMutation } = useSync();
  return useMutation({
    mutationFn: async (args: { supplierId: string; whatsappMessage: string; total: number; currency?: string; items: Array<{ productId: string; name: string; qty: number; unitPrice: number }> }) => {
      if (!user?.pharmacyId) throw new Error("Finish setting up your pharmacy first.");
      return runOfflineCapableWrite<string>({
        type: "create_purchase_order",
        summary: `Order · ${args.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}`.slice(0, 120),
        queueMutation,
        payload: {
          p_pharmacy_id: user.pharmacyId,
          p_supplier_id: args.supplierId,
          p_items: args.items.map((i) => ({ product_id: i.productId ?? null, name: i.name, qty: i.qty, unit_price: i.unitPrice })),
          p_whatsapp_message: args.whatsappMessage,
          // Captured when the order is made, so a queued order keeps the
          // currency it was priced in (the server rejects ones it can't trade in).
          p_currency: args.currency || getActiveTenantConfig().currency
        }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["purchaseOrders", user?.pharmacyId] });
    }
  });
}
