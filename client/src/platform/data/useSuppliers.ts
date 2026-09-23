import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchWithCache } from "@/platform/offline/cachedQuery";
import { tenantKey } from "@/platform/offline/db";
import { fetchSuppliers } from "@/platform/data/suppliers";

export function useSuppliers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["suppliers", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () =>
      fetchWithCache({
        tenant: tenantKey(user?.pharmacyId ?? null, user?.id ? String(user.id) : null),
        entity: "suppliers",
        fetcher: async () => {
          // No tenant yet (pre-onboarding): show nothing rather than sample data.
          if (!user?.pharmacyId) return [];
          return fetchSuppliers({ pharmacyId: user.pharmacyId });
        }
      })
  });
}
