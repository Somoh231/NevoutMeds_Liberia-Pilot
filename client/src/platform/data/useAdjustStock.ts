import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { adjustStock } from "@/platform/data/inventory";
import { trackEvent } from "@/platform/reliability/telemetry";

export function useAdjustStock() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: { productId: string; delta: number; note?: string }) => {
      // Demo Mode (or pre-onboarding): don't block the UI.
      if (!user?.pharmacyId) return;
      await adjustStock({ pharmacyId: user.pharmacyId, productId: args.productId, delta: args.delta, note: args.note ?? null });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventoryMedicines", user?.pharmacyId] });
      if (user?.pharmacyId) {
        void trackEvent({
          pharmacyId: user.pharmacyId,
          userId: String(user.id),
          eventName: "inventory_adjusted",
          module: "inventory",
          metadata: {}
        });
      }
    }
  });
}

