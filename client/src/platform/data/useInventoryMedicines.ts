import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchInventoryMedicines } from "@/platform/data/inventory";
import { MEDICINES } from "@/platform/seed/medicines";

export function useInventoryMedicines() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["inventoryMedicines", user?.pharmacyId],
    enabled: !!user,
    queryFn: async () => {
      const pharmacyId = user?.pharmacyId;
      if (!pharmacyId) {
        // Keep UI intact until profiles/pharmacies are provisioned.
        return MEDICINES;
      }
      return fetchInventoryMedicines({ pharmacyId });
    }
  });
}

