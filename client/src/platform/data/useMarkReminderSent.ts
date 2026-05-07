import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { markReminderSentDb } from "@/platform/data/reminders";

export function useMarkReminderSent() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (args: { reminderId: string }) => {
      if (!user?.pharmacyId) throw new Error("Missing pharmacy_id");
      await markReminderSentDb({ pharmacyId: user.pharmacyId, reminderId: args.reminderId });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["reminders", user?.pharmacyId] });
      await qc.invalidateQueries({ queryKey: ["customers", user?.pharmacyId] });
    }
  });
}

