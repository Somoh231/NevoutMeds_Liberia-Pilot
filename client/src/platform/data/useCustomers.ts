import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchCustomers } from "@/platform/data/customers";
import { CUSTOMERS_SEED } from "@/platform/seed/customers";

export function useCustomers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["customers", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () => {
      const pharmacyId = user?.pharmacyId;
      if (!pharmacyId) return CUSTOMERS_SEED;
      return fetchCustomers({ pharmacyId });
    }
  });
}

