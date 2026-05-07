import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { recordPurchase } from "@/platform/data/purchases";
import { trackEvent } from "@/platform/reliability/telemetry";

export function useRecordPurchase() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: { customerId: string; method: string; items: Array<{ productId: string; name: string; qty: number; unitPrice: number }> }) => {
      // Demo Mode (or pre-onboarding): don't block the UI.
      if (!user?.pharmacyId) return;
      await recordPurchase({
        pharmacyId: user.pharmacyId,
        customerId: args.customerId,
        method: args.method,
        staffId: String(user.id),
        items: args.items
      });
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["customers", user?.pharmacyId] }),
        qc.invalidateQueries({ queryKey: ["inventoryMedicines", user?.pharmacyId] }),
        qc.invalidateQueries({ queryKey: ["dashboardKpis", user?.pharmacyId] })
      ]);
      if (user?.pharmacyId) {
        void trackEvent({
          pharmacyId: user.pharmacyId,
          userId: String(user.id),
          eventName: "purchase_recorded",
          module: "customers",
          metadata: {}
        });
      }
    }
  });
}

