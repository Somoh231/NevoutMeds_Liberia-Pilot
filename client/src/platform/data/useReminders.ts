import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchReminders } from "@/platform/data/reminders";

export function useReminders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["reminders", user?.pharmacyId],
    enabled: !!user?.pharmacyId,
    queryFn: async () => fetchReminders({ pharmacyId: user!.pharmacyId! })
  });
}

