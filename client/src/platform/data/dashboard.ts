import type { UUID } from "@/platform/db/types";
import { getSupabaseDb } from "@/platform/data/supabaseDb";
import { addDays, businessDayKey, startOfBusinessDay } from "@/platform/country/datetime";
import { getActiveTenantConfig, tenantToday } from "@/platform/country/tenant";

export type DashboardKpis = {
  lowStockCount: number;
  expiringSoonCount: number;
  totalCustomers: number;
  outstandingCredit: number;
  revenueLast30Days: number;
  revenueToday: number;
  salesCountToday: number;
  /** `date` is the pharmacy's business date; `currency` is the sale's own. */
  recentSales: Array<{ id: string; date: string; amount: number; currency: string; method: string; items: string }>;
  fastMoving: Array<{ id: string; name: string; dailyVelocity: number }>;
};

export async function fetchDashboardKpis(args: { pharmacyId: UUID }): Promise<DashboardKpis> {
  const db = getSupabaseDb();
  const { pharmacyId } = args;

  // Business days in the pharmacy's timezone — the same window as the
  // server's financial_summary (today plus the 29 days before it).
  const tenant = getActiveTenantConfig();
  const today = tenantToday();
  const since = startOfBusinessDay(addDays(today, -29), tenant.timezone);
  const startOfToday = startOfBusinessDay(today, tenant.timezone);
  // Totals only add up sales in the operating currency. Servers without the
  // Phase 9 columns have a single, implicit currency.
  const saleCols = tenant.confirmed ? "id,purchased_at,amount,method,items_text,currency_code" : "id,purchased_at,amount,method,items_text";
  let revenueQ = db.from("purchases").select("amount,purchased_at").eq("pharmacy_id", pharmacyId).gte("purchased_at", since.toISOString());
  if (tenant.confirmed) revenueQ = revenueQ.eq("currency_code", tenant.currency);

  const [custAgg, recentSalesRes, fastMovingRes, invRes, expiringRes, revenueRes] = await Promise.all([
    db.from("customers").select("id,credit_balance").eq("pharmacy_id", pharmacyId).limit(2000),
    db.from("purchases").select(saleCols).eq("pharmacy_id", pharmacyId).order("purchased_at", { ascending: false }).limit(8),
    db.from("products").select("id,name,daily_velocity").eq("pharmacy_id", pharmacyId).order("daily_velocity", { ascending: false }).limit(5),
    db.from("inventory").select("product_id,stock").eq("pharmacy_id", pharmacyId),
    db.from("inventory").select("product_id,expiry_date").eq("pharmacy_id", pharmacyId).not("expiry_date", "is", null),
    revenueQ
  ]);

  if (custAgg.error) throw custAgg.error;
  if (recentSalesRes.error) throw recentSalesRes.error;
  if (fastMovingRes.error) throw fastMovingRes.error;
  if (invRes.error) throw invRes.error;
  if (expiringRes.error) throw expiringRes.error;
  if (revenueRes.error) throw revenueRes.error;

  const customers = custAgg.data ?? [];
  const totalCustomers = customers.length;
  const outstandingCredit = customers.reduce((s: number, c: any) => s + Number(c.credit_balance ?? 0), 0);

  const revenueLast30Days = (revenueRes.data ?? []).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

  // Today's figures come from the purchases the caller can already read, so
  // staff see a real number without needing the owner-only financial RPC.
  const todaysSales = (revenueRes.data ?? []).filter((p: any) => new Date(p.purchased_at).getTime() >= startOfToday.getTime());
  const revenueToday = todaysSales.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const salesCountToday = todaysSales.length;

  const recentSales = (recentSalesRes.data ?? []).map((p: any) => ({
    id: p.id,
    date: businessDayKey(p.purchased_at, tenant.timezone),
    amount: Number(p.amount ?? 0),
    currency: p.currency_code ?? tenant.currency,
    method: p.method ?? "",
    items: p.items_text ?? ""
  }));

  const fastMoving = (fastMovingRes.data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name ?? "",
    dailyVelocity: Number(p.daily_velocity ?? 0)
  }));

  // Low stock and expiring soon derived from inventory + products metadata (reorder_point / expiry_date).
  // For now, "low stock" counts items where inventory.stock <= products.reorder_point.
  const productMetaRes = await db.from("products").select("id,reorder_point").eq("pharmacy_id", pharmacyId);
  if (productMetaRes.error) throw productMetaRes.error;
  const reorderByProduct: Record<string, number> = {};
  for (const p of productMetaRes.data ?? []) reorderByProduct[p.id] = Number((p as any).reorder_point ?? 0);

  const lowStockCount = (invRes.data ?? []).filter((r: any) => Number(r.stock ?? 0) <= (reorderByProduct[r.product_id] ?? 0)).length;

  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  const expiringSoonCount = (expiringRes.data ?? []).filter((r: any) => {
    const d = r.expiry_date ? new Date(r.expiry_date) : null;
    return d && d.getTime() > Date.now() && d.getTime() <= soon.getTime();
  }).length;

  return {
    lowStockCount,
    expiringSoonCount,
    totalCustomers,
    outstandingCredit,
    revenueLast30Days,
    revenueToday,
    salesCountToday,
    recentSales,
    fastMoving
  };
}

