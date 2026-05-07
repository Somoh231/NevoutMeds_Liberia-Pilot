import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchSupplierCatalogueForProduct } from "@/platform/data/suppliers";

export function useSupplierQuotes(productId: string | number | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["supplierQuotes", user?.pharmacyId, productId],
    enabled: !!user?.pharmacyId && !!productId,
    queryFn: async () => fetchSupplierCatalogueForProduct({ pharmacyId: user!.pharmacyId!, productId: String(productId) })
  });
}

