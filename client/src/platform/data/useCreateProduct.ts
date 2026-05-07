import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { createProductWithInventory, type CreateProductInput } from "@/platform/data/createProduct";

export function useCreateProduct() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: Omit<CreateProductInput, "pharmacyId">) => {
      if (!user?.pharmacyId) throw new Error("Missing pharmacy_id for current user");
      return await createProductWithInventory({ pharmacyId: user.pharmacyId as any, ...args });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inventoryMedicines", user?.pharmacyId] });
    }
  });
}

