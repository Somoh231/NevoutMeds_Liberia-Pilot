import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { createSupplier, recordSupplierPrice } from "@/platform/data/purchaseOrders";

/** Online-only writes (not in the offline queue): the UI says so when offline. */
export function useCreateSupplier() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: Omit<Parameters<typeof createSupplier>[0], "pharmacyId">) => {
      if (!user?.pharmacyId) throw new Error("Finish setting up your pharmacy first.");
      return createSupplier({ pharmacyId: user.pharmacyId, ...args });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["suppliers", user?.pharmacyId] })
  });
}

export function useRecordSupplierPrice() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: Omit<Parameters<typeof recordSupplierPrice>[0], "pharmacyId">) => {
      if (!user?.pharmacyId) throw new Error("Finish setting up your pharmacy first.");
      return recordSupplierPrice({ pharmacyId: user.pharmacyId, ...args });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["supplierCatalogue", user?.pharmacyId] })
  });
}
