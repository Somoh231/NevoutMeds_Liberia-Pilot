import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchWithCache } from "@/platform/offline/cachedQuery";
import { tenantKey } from "@/platform/offline/db";
import { fetchPurchaseOrders } from "@/platform/data/purchaseOrders";

export function usePurchaseOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["purchaseOrders", user?.pharmacyId],
    enabled: !!user?.pharmacyId,
    queryFn: async () =>
      fetchWithCache({
        tenant: tenantKey(user?.pharmacyId ?? null, user?.id ? String(user.id) : null),
        entity: "purchase_orders",
        fetcher: async () => fetchPurchaseOrders({ pharmacyId: user!.pharmacyId! })
      })
  });
}
