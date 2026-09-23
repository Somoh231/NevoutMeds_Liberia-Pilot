import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchStockMovements } from "@/platform/data/inventory";

export function useStockMovements(productId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["stockMovements", user?.pharmacyId, productId],
    enabled: !!user?.pharmacyId && !!productId && !String(productId).startsWith("tmp-"),
    queryFn: async () => fetchStockMovements({ pharmacyId: String(user!.pharmacyId), productId: String(productId) })
  });
}
