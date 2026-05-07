import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { fetchDashboardKpis } from "@/platform/data/dashboard";

export function useDashboardKpis() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["dashboardKpis", user?.pharmacyId],
    enabled: !!user?.pharmacyId,
    queryFn: async () => fetchDashboardKpis({ pharmacyId: String(user!.pharmacyId) })
  });
}

