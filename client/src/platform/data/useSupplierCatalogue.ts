import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchWithCache } from "@/platform/offline/cachedQuery";
import { tenantKey } from "@/platform/offline/db";
import { fetchCatalogue } from "@/platform/data/suppliers";

/** All recorded supplier prices (cached on the device like other operational data). */
export function useSupplierCatalogue() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["supplierCatalogue", user?.pharmacyId],
    enabled: !!user?.pharmacyId,
    queryFn: async () =>
      fetchWithCache({
        tenant: tenantKey(user?.pharmacyId ?? null, user?.id ? String(user.id) : null),
        entity: "supplier_catalogue",
        fetcher: async () => fetchCatalogue({ pharmacyId: String(user!.pharmacyId) })
      })
  });
}
