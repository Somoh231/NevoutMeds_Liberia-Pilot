import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { useSync } from "@/platform/offline/SyncProvider";
import { runOfflineCapableWrite } from "@/platform/offline/offlineMutation";
import type { NewCustomerInput } from "@/platform/data/customers";

export function useCreateCustomer() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { queueMutation } = useSync();

  return useMutation({
    mutationFn: async (args: Omit<NewCustomerInput, "pharmacyId">) => {
      if (!user?.pharmacyId) throw new Error("Finish onboarding before adding customers");
      return runOfflineCapableWrite<string>({
        type: "create_customer",
        summary: `Customer · ${args.firstName} ${args.lastName}`,
        queueMutation,
        payload: {
          p_pharmacy_id: user.pharmacyId,
          p_phone: args.phone,
          p_first_name: args.firstName,
          p_last_name: args.lastName,
          p_payload: {
            alt_phone: args.altPhone ?? null,
            alt_name: args.altName ?? null,
            dob: args.dob || null,
            gender: args.gender ?? null,
            community: args.community ?? null,
            landmark: args.landmark ?? null,
            county: args.county ?? null,
            conditions: args.conditions ?? [],
            allergies: args.allergies ?? [],
            notes: args.notes ?? null,
            credit_limit: args.creditLimit ?? 0
          }
        }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customers", user?.pharmacyId] });
    }
  });
}
