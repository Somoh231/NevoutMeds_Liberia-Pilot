import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchWithCache } from "@/platform/offline/cachedQuery";
import { tenantKey } from "@/platform/offline/db";
import { fetchReminders } from "@/platform/data/reminders";

export function useReminders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["reminders", user?.pharmacyId],
    enabled: !!user?.pharmacyId,
    queryFn: async () =>
      fetchWithCache({
        tenant: tenantKey(user?.pharmacyId ?? null, user?.id ? String(user.id) : null),
        entity: "reminders",
        fetcher: async () => fetchReminders({ pharmacyId: user!.pharmacyId! })
      }),
  });
}

