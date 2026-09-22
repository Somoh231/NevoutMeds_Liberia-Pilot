import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { useSync } from "@/platform/offline/SyncProvider";
import { runOfflineCapableWrite } from "@/platform/offline/offlineMutation";

export function useCreateReminder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { queueMutation } = useSync();

  return useMutation({
    mutationFn: async (args: { customerId: string; medicine: string; dueDate: string; note?: string }) => {
      if (!user?.pharmacyId) throw new Error("Finish onboarding before adding reminders");
      return runOfflineCapableWrite<string>({
        type: "create_reminder",
        summary: `Reminder · ${args.medicine}`,
        queueMutation,
        payload: {
          p_pharmacy_id: user.pharmacyId,
          p_customer_id: args.customerId,
          p_medicine: args.medicine,
          p_due_date: args.dueDate,
          p_note: args.note ?? null
        }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["reminders", user?.pharmacyId] });
    }
  });
}
