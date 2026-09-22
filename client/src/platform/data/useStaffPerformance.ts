import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { getSupabaseDb } from "@/platform/data/supabaseDb";

export type StaffPerformanceRow = {
  user_id: string;
  name: string;
  role: "owner" | "staff" | "admin";
  last_seen_at: string | null;
  sales_total: number;
  transactions: number;
  avg_sale: number;
  daily: Array<{ day: string; total: number }>;
};

// Real staff records + real sales attribution (replaces the STAFF_DATA fixture).
export function useStaffPerformance(days = 7) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["staffPerformance", user?.pharmacyId, days],
    enabled: !!user?.pharmacyId,
    queryFn: async () => {
      const db = getSupabaseDb();
      const { data, error } = await db.rpc("staff_performance", { p_days: days });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        sales_total: Number(r.sales_total ?? 0),
        transactions: Number(r.transactions ?? 0),
        avg_sale: Number(r.avg_sale ?? 0),
        daily: Array.isArray(r.daily) ? r.daily.map((d: any) => ({ day: d.day, total: Number(d.total ?? 0) })) : []
      })) as StaffPerformanceRow[];
    }
  });
}
