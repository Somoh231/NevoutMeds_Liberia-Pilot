import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchSuppliers } from "@/platform/data/suppliers";
import { SUPPLIER_DATA } from "@/platform/seed/suppliers";

export function useSuppliers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["suppliers", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () => {
      if (!user?.pharmacyId) return SUPPLIER_DATA;
      return fetchSuppliers({ pharmacyId: user.pharmacyId });
    }
  });
}

