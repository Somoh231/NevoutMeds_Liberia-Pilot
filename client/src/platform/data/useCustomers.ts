import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchWithCache } from "@/platform/offline/cachedQuery";
import { tenantKey } from "@/platform/offline/db";
import { fetchCustomers } from "@/platform/data/customers";

export function useCustomers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["customers", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () =>
      fetchWithCache({
        tenant: tenantKey(user?.pharmacyId ?? null, user?.id ? String(user.id) : null),
        entity: "customers",
        fetcher: async () => {
      const pharmacyId = user?.pharmacyId;
      // Before onboarding there is no tenant yet — show nothing rather than seed data.
      if (!pharmacyId) return [];
      return fetchCustomers({ pharmacyId });
        }
      })
  });
}

