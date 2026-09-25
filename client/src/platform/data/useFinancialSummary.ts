import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth/AuthProvider";
import { getSupabaseDb } from "@/platform/data/supabaseDb";
import { can } from "@/platform/auth/capabilities";

export type FinancialSummary = {
  window_days: number;
  generated_at: string;
  /** Phase 9: the currency every figure is in, and the server-resolved business day. */
  currency?: string;
  timezone?: string;
  business_date?: string;
  /** Sales recorded in other currencies — reported beside, never added into, the totals. */
  other_currencies?: Array<{ currency: string; total: number; transactions: number }>;
  revenue: {
    total: number;
    today: number;
    transactions: number;
    by_method: Array<{ method: string; total: number; count: number }>;
    daily: Array<{ day: string; total: number }>;
  };
  cogs: { total: number; covered_line_items: number; untracked_line_items: number };
  credit: { outstanding: number; customers: number; over_limit: Array<{ id: string; name: string; balance: number; limit: number }> };
  inventory_value: { at_cost: number; at_retail: number };
  /** Figures the database genuinely cannot produce yet — never invented in the UI. */
  not_tracked: string[];
};

export function useFinancialSummary(days = 30) {
  const { user } = useAuth();
  // The RPC is owner/admin-only by design; never call it as staff.
  const allowed = can(user, "financials.read");

  return useQuery({
    queryKey: ["financialSummary", user?.pharmacyId, days],
    enabled: !!user?.pharmacyId && allowed,
    queryFn: async () => {
      const db = getSupabaseDb();
      const { data, error } = await db.rpc("financial_summary", { p_days: days });
      if (error) throw error;
      return data as FinancialSummary;
    }
  });
}
