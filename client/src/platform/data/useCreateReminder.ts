import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { createReminder } from "@/platform/data/reminders";

export function useCreateReminder() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: { customerId: string; medicine: string; dueDate: string; note: string }) => {
      if (!user?.pharmacyId) throw new Error("Missing pharmacy_id");
      await createReminder({ pharmacyId: user.pharmacyId, customerId: args.customerId, medicine: args.medicine, dueDate: args.dueDate, note: args.note || null });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["reminders", user?.pharmacyId] });
      await qc.invalidateQueries({ queryKey: ["customers", user?.pharmacyId] });
    }
  });
}

