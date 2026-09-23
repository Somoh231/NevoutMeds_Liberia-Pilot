import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchProductSales } from "@/platform/data/purchases";

export function useProductSales(days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["productSales", user?.pharmacyId, days],
    enabled: !!user?.pharmacyId,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      return fetchProductSales({ pharmacyId: String(user!.pharmacyId), sinceISO: since });
    }
  });
}
