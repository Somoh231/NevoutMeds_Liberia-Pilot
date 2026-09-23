import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchProductSales } from "@/platform/data/purchases";
import { addDays, startOfBusinessDay } from "@/platform/country/datetime";
import { getActiveTenantConfig, tenantToday } from "@/platform/country/tenant";

export function useProductSales(days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["productSales", user?.pharmacyId, days],
    enabled: !!user?.pharmacyId,
    queryFn: async () => {
      // The same business-day window as financial_summary, in the operating currency.
      const tenant = getActiveTenantConfig();
      const since = startOfBusinessDay(addDays(tenantToday(), -(days - 1)), tenant.timezone).toISOString();
      return fetchProductSales({ pharmacyId: String(user!.pharmacyId), sinceISO: since, currency: tenant.confirmed ? tenant.currency : undefined });
    }
  });
}
