import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchDashboardKpis } from "@/platform/data/dashboard";

export function useDashboardKpis() {
  const { user } = useAuth();

  return useQuery({
    // The business day depends on the pharmacy's timezone: never reuse figures
    // computed under another one (e.g. before the country settings loaded).
    queryKey: ["dashboardKpis", user?.pharmacyId, user?.country?.timezone ?? null],
    enabled: !!user?.pharmacyId,
    queryFn: async () => fetchDashboardKpis({ pharmacyId: String(user!.pharmacyId) })
  });
}

