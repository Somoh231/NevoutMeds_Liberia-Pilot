import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { createPurchaseOrder } from "@/platform/data/purchaseOrders";

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: { supplierId: string; whatsappMessage: string; total: number; items: Array<{ productId: string; name: string; qty: number; unitPrice: number }> }) => {
      if (!user?.pharmacyId) throw new Error("Missing pharmacy_id");
      return createPurchaseOrder({
        pharmacyId: user.pharmacyId,
        supplierId: args.supplierId,
        createdBy: String(user.id),
        whatsappMessage: args.whatsappMessage,
        total: args.total,
        items: args.items
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["purchaseOrders", user?.pharmacyId] });
    }
  });
}

