import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchSuppliers } from "@/platform/data/suppliers";

export function useSuppliers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["suppliers", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () => {
      // No tenant yet (pre-onboarding): show nothing rather than sample data.
      if (!user?.pharmacyId) return [];
      return fetchSuppliers({ pharmacyId: user.pharmacyId });
    }
  });
}

