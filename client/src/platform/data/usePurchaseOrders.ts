import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchPurchaseOrders } from "@/platform/data/purchaseOrders";

export function usePurchaseOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["purchaseOrders", user?.pharmacyId],
    enabled: !!user?.pharmacyId,
    queryFn: async () => fetchPurchaseOrders({ pharmacyId: user!.pharmacyId! })
  });
}

