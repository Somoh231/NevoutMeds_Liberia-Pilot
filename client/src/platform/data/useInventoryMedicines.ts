import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchWithCache } from "@/platform/offline/cachedQuery";
import { tenantKey } from "@/platform/offline/db";
import { fetchInventoryMedicines } from "@/platform/data/inventory";

export function useInventoryMedicines() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["inventoryMedicines", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () =>
      fetchWithCache({
        tenant: tenantKey(user?.pharmacyId ?? null, user?.id ? String(user.id) : null),
        entity: "inventory",
        fetcher: async () => {
      const pharmacyId = user?.pharmacyId;
      // No tenant yet (pre-onboarding): show nothing rather than sample data.
      if (!pharmacyId) return [];
      return fetchInventoryMedicines({ pharmacyId });
        }
      })
  });
}

